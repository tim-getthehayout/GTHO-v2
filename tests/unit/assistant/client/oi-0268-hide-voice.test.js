/** @file OI-0268 Hv1+Ha0+D0 — floating push-to-talk hidden everywhere; header
 * Assistant (typed chat), Feedback and Get Help unaffected. */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../../../src/data/supabase-client.js', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    storage: {},
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  },
}));
vi.mock('../../../../src/features/assistant/client/api.js', async importOriginal => ({
  ...(await importOriginal()),
  createAssistantApi: () => ({ config: async () => ({ model: 'grok-voice-3.0', earlyTesting: false }) }),
}));
const sessions = [];
vi.mock('../../../../src/features/assistant/client/session.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    createAssistantSession: vi.fn(options => {
      const s = { options, talk: vi.fn(async () => 'listening'), end: vi.fn(async () => {}), begin: vi.fn(async () => ({})) };
      sessions.push(s);
      return s;
    }),
  };
});
vi.mock('../../../../src/features/auth/session.js', () => ({ getUser: vi.fn(() => ({ id: 'u1', email: 't@example.com' })), logout: vi.fn() }));

const { mountHeaderAssistant, PUSH_TO_TALK_ENABLED } = await import('../../../../src/features/assistant/client/wiring.js');
const { mountPushToTalk } = await import('../../../../src/features/assistant/client/push-to-talk.js');
import { _reset, add } from '../../../../src/data/store.js';
import { setLocale } from '../../../../src/i18n/i18n.js';
import enLocale from '../../../../src/i18n/locales/en.json';
import * as OperationEntity from '../../../../src/entities/operation.js';
import * as FarmEntity from '../../../../src/entities/farm.js';
import * as FarmSettingEntity from '../../../../src/entities/farm-setting.js';

const ROOT = resolve(__dirname, '../../../..');
const OP = '00000000-0000-4000-8000-0000000000aa';
const FARM = '00000000-0000-4000-8000-0000000000bb';
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); };
const setWidth = (compact) => {
  window.matchMedia = vi.fn(q => ({ matches: compact && q.includes('max-width: 899px'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
};
const opts = () => ({ operationId: OP, getUser: () => ({ id: 'u1' }), openFeedbackSheet: vi.fn(), screen: () => 'dashboard', buildStamp: null });

beforeAll(() => setLocale('en', enLocale));
beforeEach(() => {
  document.body.innerHTML = '';
  sessions.length = 0;
  localStorage.clear();
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('OI-0268 Hv1 — floating push-to-talk hidden everywhere', () => {
  it('flag is off', () => {
    expect(PUSH_TO_TALK_ENABLED).toBe(false);
  });

  for (const [label, compact] of [['phone', true], ['desktop', false]]) {
    it(`#gtho-push-to-talk is absent after mount at ${label} width`, async () => {
      setWidth(compact);
      const button = document.createElement('button');
      document.body.appendChild(button);
      const config = await mountHeaderAssistant(button, opts());
      expect(config).toBeTruthy(); // backend config present — the old path would have mounted the bar
      expect(document.getElementById('gtho-push-to-talk')).toBeNull();
      expect(document.querySelector('[data-testid="ptt"]')).toBeNull();
    });
  }

  it('a bar left from an earlier mount is removed, not kept', async () => {
    setWidth(true);
    mountPushToTalk({ scope: () => ({ operationId: OP, actorId: 'u1' }), online: () => true, offlineNotes: { list: async () => [], save: vi.fn() } }, {}, { compact: true });
    expect(document.getElementById('gtho-push-to-talk')).toBeTruthy();
    await mountHeaderAssistant(document.createElement('button'), opts());
    expect(document.getElementById('gtho-push-to-talk')).toBeNull();
  });

  it('push-to-talk.js and its CSS stay in the tree (restorable)', () => {
    expect(existsSync(resolve(ROOT, 'src/features/assistant/client/push-to-talk.js'))).toBe(true);
    expect(readFileSync(resolve(ROOT, 'src/styles/main.css'), 'utf8')).toMatch(/\.gtho-ptt/);
  });
});

describe('OI-0268 Ha0 — header Assistant still opens typed chat', () => {
  it('config reveals the button and a click opens the sheet in text mode (no voice session)', async () => {
    setWidth(true);
    const button = document.createElement('button');
    document.body.appendChild(button);
    await mountHeaderAssistant(button, opts());
    expect(button.hidden).toBe(false);
    button.click();
    await flush();
    expect(document.querySelector('[data-testid="assistant-text"]')).toBeTruthy();
    expect(sessions.every(s => s.talk.mock.calls.length === 0)).toBe(true);
    expect(document.getElementById('gtho-push-to-talk')).toBeNull();
  });
});

describe('OI-0268 — rendered header: Assistant, Feedback and Get Help unaffected', () => {
  beforeEach(() => {
    _reset();
    add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
      OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
    add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
      FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
    add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
      FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  });

  for (const [label, compact] of [['phone', true], ['desktop', false]]) {
    it(`flag on + config: Assistant shown, no floating bar, Feedback/Get Help open their sheet (${label})`, async () => {
      setWidth(compact);
      vi.stubEnv('VITE_GTHO_ASSISTANT', '1');
      const { renderHeader } = await import('../../../../src/ui/header.js');
      const app = document.createElement('div');
      document.body.appendChild(app);
      renderHeader(app);
      await flush();
      const assistant = app.querySelector('[data-testid="header-assistant-btn"]');
      expect(assistant).toBeTruthy();
      expect(assistant.hidden).toBe(false);
      expect(document.getElementById('gtho-push-to-talk')).toBeNull();
      const feedback = app.querySelector('[data-testid="header-feedback-btn"]');
      const help = app.querySelector('[data-testid="header-help-btn"]');
      expect(feedback.textContent).toContain('Feedback');
      expect(help.textContent).toContain('Get Help');
      feedback.click();
      expect(document.getElementById('fb-sheet-wrap')).toBeTruthy();
      expect(document.getElementById('fb-sheet-panel').textContent.length).toBeGreaterThan(0);
      help.click();
      expect(document.getElementById('fb-sheet-panel').textContent.length).toBeGreaterThan(0);
    });
  }
});
