import { CURRENT_SCHEMA_VERSION } from '../../../src/data/backup-import.js';
import { describe,it,expect,vi,beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(),rpc: vi.fn(),pull: vi.fn(),autoBackup: vi.fn(),download: vi.fn() }));
vi.mock('../../../src/data/supabase-client.js',() => ({ supabase: { from: mocks.from,rpc: mocks.rpc } }));
vi.mock('../../../src/data/backup-export.js',() => ({ canExport: () => ({ ok: true }),exportOperationBackup: mocks.autoBackup,downloadBackup: mocks.download }));
vi.mock('../../../src/data/pull-remote.js',() => ({ pullAllRemote: mocks.pull }));
import { importOperationBackup } from '../../../src/data/backup-import.js';
import { SERVER_ASSISTANT_TABLES } from '../../../src/features/assistant/schema.js';
const op = '00000000-0000-4000-8000-000000000001',token = '00000000-0000-4000-8000-000000000002';
const backup = () => ({ format: 'gtho-v2-backup',format_version: 1,schema_version: CURRENT_SCHEMA_VERSION,operation_id: op,tables: { operations: [{ id: op }] } });
let events,stage,prepareResult,finishResult,abortResult,prepareAction;
beforeEach(() => {
  vi.clearAllMocks();localStorage.clear();events = [];stage = null;prepareAction = null;
  prepareResult = { data: [{ outcome: 'prepared',fence_token: token }] };finishResult = { data: [{ outcome: 'finished' }] };abortResult = { data: [{ outcome: 'aborted' }] };
  mocks.rpc.mockImplementation(async name => { events.push(name);if (name.endsWith('prepare')) { prepareAction?.();return prepareResult; }return name.endsWith('finish') ? finishResult : abortResult; });
  mocks.pull.mockResolvedValue();mocks.autoBackup.mockResolvedValue({ json: '{}',fileName: 'gtho-v2-backup__test.json' });
  mocks.from.mockImplementation(table => {
    const result = action => { events.push(`${action}:${table}`);return { error: stage === action ? { message: 'fixture failure' } : null,count: table === 'operations' ? (stage === 'parity' ? 0 : 1) : 0 }; };
    const filtered = action => { const value = result(action);return Object.assign(Promise.resolve(value),{ eq: async () => value }); };
    return { select: () => filtered('select'),update: () => filtered('update'),delete: () => filtered('delete'),insert: async () => result('insert'),upsert: async () => result('upsert') };
  });
});
const run = (data = backup(),options = {},progress) => importOperationBackup(data,op,progress,{ skipAutoBackup: true,...options });
const names = () => mocks.rpc.mock.calls.map(([name]) => name);
describe('CP-56 fenced prepare/finish/abort lifecycle',() => {
  it.each([{ data: [{ outcome: 'retained-authority' }] },{ data: [{ outcome: 'restore-in-progress' }] },{ data: null },{ error: { code: '42501' } },{ data: [{ outcome: 'prepared',fence_token: '' }] }])('refuses failed/unknown prepare before any other work',async result => {
    prepareResult = result;const data = backup(),before = structuredClone(data);
    expect((await run(data,{ skipAutoBackup: false })).success).toBe(false);
    expect(names()).toEqual(['assistant_restore_prepare']);expect(mocks.from).not.toHaveBeenCalled();expect(mocks.autoBackup).not.toHaveBeenCalled();expect(data).toEqual(before);
  });
  it.each(['envelope','parent','client'])('refuses a cross-operation %s before admission or writes',async kind => {
    const data = backup();if (kind === 'envelope') data.operation_id = 'other';else if (kind === 'parent') data.tables.operations[0].id = 'other';else data.tables.farms = [{ id: 'farm',operation_id: 'other' }];
    expect((await run(data)).success).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.from).not.toHaveBeenCalled();
  });
  it('does not prepare a backup with unsatisfiable offline-note execution-result references',async () => {
    const data = backup();data.tables.offline_voice_notes = [{ confirmed_execution_result_id: 'excluded' }];
    expect((await run(data)).success).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.from).not.toHaveBeenCalled();
  });
  it('prepares first, ignores every supplied server array, restores only client tables, then finishes with the exact token',async () => {
    const data = backup();for (const table of SERVER_ASSISTANT_TABLES) data.tables[table] = [{ operation_id: op,forged: true }];
    expect((await run(data)).success).toBe(true);expect(events[0]).toBe('assistant_restore_prepare');expect(events.at(-1)).toBe('assistant_restore_finish');
    expect(mocks.rpc).toHaveBeenCalledWith('assistant_restore_prepare',{ p_operation: op });expect(mocks.rpc).toHaveBeenCalledWith('assistant_restore_finish',{ p_operation: op,p_fence_token: token });
    for (const [table] of mocks.from.mock.calls) expect(SERVER_ASSISTANT_TABLES.has(table)).toBe(false);
    expect(names()).not.toContain('assistant_restore_abort');
  });
  it('aborts on auto-backup failure without any destructive writes',async () => {
    mocks.autoBackup.mockRejectedValue(new Error('fixture backup failure'));
    expect((await run(backup(),{ skipAutoBackup: false })).success).toBe(false);expect(mocks.from).not.toHaveBeenCalled();expect(names()).toEqual(['assistant_restore_prepare','assistant_restore_abort']);
  });
  it('aborts on a missing backup migration before any destructive writes',async () => {
    const data = backup();data.schema_version = 13;
    expect((await run(data)).success).toBe(false);expect(mocks.from).not.toHaveBeenCalled();expect(names().at(-1)).toBe('assistant_restore_abort');
  });
  it.each(['update','delete','insert','parity'])('aborts on %s failure and never reports finish',async failure => {
    stage = failure;const data = backup();if (failure === 'insert') data.tables.farms = [{ id: 'farm',operation_id: op }];
    expect((await run(data)).success).toBe(false);expect(names()).toEqual(['assistant_restore_prepare','assistant_restore_abort']);
    expect(mocks.rpc).toHaveBeenLastCalledWith('assistant_restore_abort',{ p_operation: op,p_fence_token: token });
  });
  it('aborts when refresh fails rather than swallowing failure and finishing',async () => {
    mocks.pull.mockRejectedValue(new Error('fixture refresh failure'));expect((await run()).success).toBe(false);expect(names().at(-1)).toBe('assistant_restore_abort');
  });
  it('does not prepare a pre-cancelled restore; cancellation during prepare aborts before any table write',async () => {
    const controller = new AbortController();controller.abort();expect((await run(backup(),{ signal: controller.signal })).success).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();
    const during = new AbortController();prepareAction = () => during.abort();
    expect((await run(backup(),{ signal: during.signal })).success).toBe(false);expect(mocks.from).not.toHaveBeenCalled();expect(names()).toEqual(['assistant_restore_prepare','assistant_restore_abort']);
  });
  it('aborts if a progress callback throws following prepare',async () => {
    expect((await run(backup(),{ skipAutoBackup: false },phase => { if (phase === 'Saving current data (auto-backup)') throw new Error('cancelled by UI'); })).success).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();expect(names().at(-1)).toBe('assistant_restore_abort');
  });
  it('aborts cancellation from delete progress before the pending destructive write',async () => {
    const controller = new AbortController();const result = await run(backup(),{ signal: controller.signal },(phase,detail) => { if (detail.startsWith('Deleting')) controller.abort(); });
    expect(result.success).toBe(false);expect(events.some(event => event.startsWith('delete:'))).toBe(false);expect(names().at(-1)).toBe('assistant_restore_abort');
  });
  it('attempts abort after an unverifiable finish and reports failure',async () => {
    finishResult = { error: { code: 'transport-failure' } };expect((await run()).success).toBe(false);expect(names()).toEqual(['assistant_restore_prepare','assistant_restore_finish','assistant_restore_abort']);
  });
  it('never pretends an abort released a fence when its result is unknown',async () => {
    stage = 'update';abortResult = { error: { code: 'transport-failure' } };const result = await run();
    expect(result.success).toBe(false);expect(result.fenceReleaseFailed).toBe(true);expect(result.error).toContain('may remain fenced');expect(result.error).not.toContain(token);
  });
});
