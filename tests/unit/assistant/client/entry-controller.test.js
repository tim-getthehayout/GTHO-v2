import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { openAssistant, COMPOSER_PLACEHOLDER, OFFLINE_TEXT } = await import('../../../../src/features/assistant/client/panel.js');
const { DISCARD_EMPTY_FAILED_MESSAGE } = await import('../../../../src/features/assistant/client/session.js');

function deps() {
  const commands = [];
  return {
    commands,
    api: {
      config: async () => ({}),
      command: vi.fn(async (ref, command) => {
        commands.push(command);
        return { session: { intent: 'data-entry', phase: 'converse', transcript: [], capture: {}, conversationRef: ref } };
      }),
    },
    scope: () => ({ operationId: 'op', actorId: 'u' }),
    persist: vi.fn(async (_scope, _type, data) => ({ id: data?.id ?? 'row', ...data })),
    awaitServerRows: vi.fn(async () => {}),
    online: () => true,
  };
}

describe('shared assistant entry (no picker, Type here, Cancel)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { document.body.innerHTML = ''; document.onkeydown = null; });

  it('opens the composer immediately with Type here, Cancel, and no intent buttons, without starting a session', () => {
    const d = deps();
    openAssistant(d, {});
    expect(document.querySelectorAll('[data-testid^="assistant-intent-"]')).toHaveLength(0);
    const input = document.querySelector('[data-testid="assistant-text"]');
    expect(input.placeholder).toBe(COMPOSER_PLACEHOLDER);
    expect(COMPOSER_PLACEHOLDER).toBe('Type here');
    expect(document.querySelector('[data-testid="assistant-cancel"]').textContent).toBe('Cancel');
    expect(d.api.command).not.toHaveBeenCalled();
  });

  it('does not flash a picker when opened as the Type-instead fallback, and focuses the composer', () => {
    const d = deps();
    openAssistant(d, {}, { intent: 'data-entry', focusText: true });
    expect(document.querySelectorAll('[data-testid^="assistant-intent-"]')).toHaveLength(0);
    expect(document.querySelector('[data-testid="assistant-text"]').placeholder).toBe('Type here');
    expect(document.activeElement).toBe(document.querySelector('[data-testid="assistant-text"]'));
    expect(d.api.command).not.toHaveBeenCalled();
  });

  it('Cancel on an untouched composer closes locally with no start or discard RPC', async () => {
    const d = deps();
    const entry = openAssistant(d, {});
    await entry.close();
    expect(d.api.command).not.toHaveBeenCalled();
    expect(document.getElementById('assistant-sheet-wrap')?.classList.contains('open')).toBeFalsy();
  });

  it('backdrop and Escape share the same untouched close (no RPC)', async () => {
    const d = deps();
    openAssistant(d, {});
    document.querySelector('#assistant-sheet-wrap .sheet-backdrop').click();
    await Promise.resolve();
    expect(d.api.command).not.toHaveBeenCalled();

    document.body.innerHTML = '';
    const d2 = deps();
    openAssistant(d2, {});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();
    expect(d2.api.command).not.toHaveBeenCalled();
  });

  it('first Send starts once with the data-entry seed and does not erase typed text if begin is delayed', async () => {
    let release;
    const d = deps();
    d.awaitServerRows = vi.fn(() => new Promise(resolve => { release = resolve; }));
    const entry = openAssistant(d, {});
    const input = document.querySelector('[data-testid="assistant-text"]');
    input.value = 'Fed e1 four bales';
    document.querySelector('[data-testid="assistant-send"]').click();
    await vi.waitFor(() => expect(typeof release).toBe('function'));
    expect(document.querySelector('[data-testid="assistant-status"]').textContent).toBe('Starting…');
    expect(input.value).toBe('Fed e1 four bales');
    release();
    await vi.waitFor(() => expect(d.commands).toContain('start'));
    expect(d.commands.filter(name => name === 'start')).toHaveLength(1);
    await vi.waitFor(() => expect(d.commands).toContain('turn'));
    expect(entry.session).toBeTruthy();
  });

  it('does not start a second session when Send is clicked twice during Starting…', async () => {
    let release;
    const d = deps();
    d.awaitServerRows = vi.fn(() => new Promise(resolve => { release = resolve; }));
    openAssistant(d, {});
    const input = document.querySelector('[data-testid="assistant-text"]');
    input.value = 'help';
    const button = document.querySelector('[data-testid="assistant-send"]');
    button.click();
    button.click();
    await vi.waitFor(() => expect(typeof release).toBe('function'));
    release();
    await vi.waitFor(() => expect(d.commands).toContain('turn'));
    expect(d.commands.filter(name => name === 'start')).toHaveLength(1);
  });

  it('close after a started empty session calls discard-empty once', async () => {
    const d = deps();
    const entry = openAssistant(d, {});
    await entry.begin('data-entry');
    await entry.close();
    expect(d.commands.filter(name => name === 'start')).toHaveLength(1);
    expect(d.commands.filter(name => name === 'discard-empty')).toHaveLength(1);
    expect(d.commands).not.toContain('cancel');
  });

  it('close on a populated session never deletes it and does not show a cleanup failure', async () => {
    const d = deps();
    d.api.command = vi.fn(async (ref, command) => {
      d.commands.push(command);
      if (command === 'discard-empty') {
        throw Object.assign(new Error('discard-empty-refused-turns-exist'), { code: 'discard-empty-refused-turns-exist' });
      }
      return { session: { intent: 'data-entry', phase: 'converse', transcript: [{ id: 't', role: 'user', text: 'e1' }], capture: {}, conversationRef: ref } };
    });
    const entry = openAssistant(d, {});
    await entry.begin('data-entry');
    await entry.close();
    expect(d.commands).toContain('discard-empty');
    expect(d.commands).not.toContain('cancel');
    expect(document.querySelector('[data-testid="assistant-cleanup-failure"]')).toBeNull();
  });

  it('a failed empty-start cleanup leaves the locked truthful message visible', async () => {
    const d = deps();
    d.api.command = vi.fn(async (ref, command) => {
      d.commands.push(command);
      if (command === 'discard-empty') throw new Error('Could not find the function public.assistant_discard_empty_start');
      return { session: { intent: 'data-entry', phase: 'converse', transcript: [], capture: {}, conversationRef: ref } };
    });
    const entry = openAssistant(d, {});
    await entry.begin('data-entry');
    await entry.close();
    expect(document.getElementById('assistant-sheet-wrap')?.classList.contains('open')).toBeFalsy();
    const banner = document.querySelector('[data-testid="assistant-cleanup-failure"]');
    expect(banner).toBeTruthy();
    expect(banner.querySelector('[data-testid="assistant-cleanup-failure-text"]').textContent).toBe(DISCARD_EMPTY_FAILED_MESSAGE);
    document.querySelector('[data-testid="assistant-cleanup-failure-dismiss"]').click();
    expect(document.querySelector('[data-testid="assistant-cleanup-failure"]')).toBeNull();
  });

  it('close during an in-flight start waits for start, then discards, and does not throw', async () => {
    const d = deps();
    let release;
    d.api.command = vi.fn(async (ref, command) => {
      d.commands.push(command);
      if (command === 'start') await new Promise(resolve => { release = resolve; });
      return { session: { intent: 'data-entry', phase: 'converse', transcript: [], capture: {}, conversationRef: ref } };
    });
    const entry = openAssistant(d, {});
    const starting = entry.begin('data-entry');
    await vi.waitFor(() => expect(typeof release).toBe('function'));
    const closing = entry.close();
    expect(d.commands).toEqual(['start']);
    expect(d.commands).not.toContain('discard-empty');
    release();
    await expect(starting).resolves.toBeDefined();
    await expect(closing).resolves.toBeUndefined();
    expect(d.commands.filter(name => name === 'start')).toHaveLength(1);
    expect(d.commands.filter(name => name === 'discard-empty')).toHaveLength(1);
    expect(d.commands.indexOf('start')).toBeLessThan(d.commands.indexOf('discard-empty'));
  });

  it('a later open is not closed by an older handle', async () => {
    const first = openAssistant(deps(), {});
    const second = openAssistant(deps(), {});
    expect(second).toBe(first);
    await first.close();
    const third = openAssistant(deps(), {});
    expect(third).not.toBe(first);
    expect(document.getElementById('assistant-sheet-wrap').classList.contains('open')).toBe(true);
    await first.close();
    expect(document.getElementById('assistant-sheet-wrap').classList.contains('open')).toBe(true);
    await third.close();
    expect(document.getElementById('assistant-sheet-wrap').classList.contains('open')).toBe(false);
  });

  it('shows the offline message and does not begin when Send is used offline', async () => {
    const d = { ...deps(), online: () => false };
    openAssistant(d, {});
    expect(document.querySelector('[data-testid="assistant-status"]').textContent).toBe(OFFLINE_TEXT);
    document.querySelector('[data-testid="assistant-text"]').value = 'hello';
    document.querySelector('[data-testid="assistant-send"]').click();
    await Promise.resolve();
    expect(d.api.command).not.toHaveBeenCalled();
  });
});

describe('voice entry chrome', () => {
  it('voice mode opens the same composer with Cancel, Type here, and an End control, and never a picker', async () => {
    const d = deps();
    const entry = openAssistant(d, {}, { mode: 'voice' });
    expect(document.querySelectorAll('[data-testid^="assistant-intent-"]')).toHaveLength(0);
    expect(document.querySelector('[data-testid="assistant-cancel"]').textContent).toBe('Cancel');
    expect(document.querySelector('[data-testid="assistant-text"]').placeholder).toBe('Type here');
    const end = document.querySelector('[data-testid="assistant-end"]');
    expect(end).toBeTruthy();
    expect(end.textContent).toBe('End');
    await entry.ready;
    // Without a mic, talk() settles as no-mic and the sheet stays put (no picker).
    expect(document.querySelector('[data-testid="assistant-cancel"]')).toBeTruthy();
    expect(document.querySelectorAll('[data-testid^="assistant-intent-"]')).toHaveLength(0);
    expect(document.querySelector('[data-testid="assistant-text"]').placeholder).toBe('Type here');
  });
});
