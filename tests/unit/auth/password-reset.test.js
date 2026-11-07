/** @file Password reset request and change-password recovery screen. */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  verifyOtp: vi.fn(),
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../../src/data/supabase-client.js', () => ({
  supabase: { auth },
}));

import { renderAuthOverlay, renderChangePassword } from '../../../src/features/auth/index.js';
import { buildStampLabel } from '../../../src/ui/build-stamp.js';
import { parseParametersFromURL } from '@supabase/auth-js/dist/module/lib/helpers.js';
import {
  readRecoveryArrival,
  passwordResetRedirectTo,
  hrefWithCleanImplicitGrant,
  installCleanRecoveryHash,
  hrefWithoutRecoverySearch,
  decideAuthScreen,
  markPasswordRecovery,
  clearPasswordRecovery,
  isPasswordRecoveryPending,
} from '../../../src/features/auth/recovery.js';
import { onAuthChange, verifyRecoveryOtp, login, getUser } from '../../../src/features/auth/session.js';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  document.body.innerHTML = '';
  clearPasswordRecovery();
  auth.resetPasswordForEmail.mockReset();
  auth.updateUser.mockReset();
  auth.verifyOtp.mockReset();
  auth.onAuthStateChange.mockReset();
  auth.onAuthStateChange.mockImplementation(() => ({
    data: { subscription: { unsubscribe() {} } },
  }));
});

function mountLogin() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderAuthOverlay(container, () => {});
  return container;
}

describe('recovery URL', () => {
  it('reads type=recovery from the implicit-grant hash', () => {
    const arrival = readRecoveryArrival(
      'https://getthehayout.com/#access_token=abc&refresh_token=def&type=recovery',
    );
    expect(arrival.type).toBe('recovery');
    expect(arrival.tokenHash).toBeNull();
    expect(arrival.isChangePasswordRoute).toBe(false);
  });

  it('reads token_hash and type=recovery from the query string', () => {
    const arrival = readRecoveryArrival(
      'https://getthehayout.com/?token_hash=hashed-token&type=recovery',
    );
    expect(arrival.type).toBe('recovery');
    expect(arrival.tokenHash).toBe('hashed-token');
  });

  it('lets the query type win over the hash, matching auth-js', () => {
    const arrival = readRecoveryArrival(
      'https://getthehayout.com/?type=recovery#access_token=abc&type=signup',
    );
    expect(arrival.type).toBe('recovery');
  });

  it('treats the change-password hash route as a route, not an auth query', () => {
    const arrival = readRecoveryArrival('https://getthehayout.com/#/change-password');
    expect(arrival.type).toBeNull();
    expect(arrival.tokenHash).toBeNull();
    expect(arrival.isChangePasswordRoute).toBe(true);
  });

  it('ignores an ordinary app hash', () => {
    const arrival = readRecoveryArrival('http://localhost:3000/#/events');
    expect(arrival.type).toBeNull();
    expect(arrival.isChangePasswordRoute).toBe(false);
  });

  it('builds redirectTo from the current origin with no hash fragment', () => {
    expect(passwordResetRedirectTo('https://getthehayout.com')).toBe(
      'https://getthehayout.com/',
    );
    expect(passwordResetRedirectTo('http://localhost:3000')).toBe(
      'http://localhost:3000/',
    );
    expect(passwordResetRedirectTo('https://getthehayout.com').includes('#')).toBe(false);
  });

  it('auth-js cannot read access_token from the double hash GoTrue builds', () => {
    // GoTrue AccessTokenResponse.AsRedirectURL is redirectTo + "#" + token query.
    // Placeholder token pieces only. Not a live recovery link.
    const fragment = 'access_token=at.fake&expires_at=1700000000&expires_in=3600&refresh_token=rt.fake&token_type=bearer&type=recovery';
    const landing = `https://getthehayout.com/#/change-password#${fragment}`;
    const parsed = parseParametersFromURL(landing);
    expect(parsed.access_token).toBeUndefined();
    expect(parsed.type).toBe('recovery');

    const encoded = `https://getthehayout.com/#/change-password%23${fragment}`;
    expect(parseParametersFromURL(encoded).access_token).toBeUndefined();
  });

  it('repairs a double-hash recovery landing into a fragment auth-js can read', () => {
    const fragment = 'access_token=at.fake&expires_at=1700000000&expires_in=3600&refresh_token=rt.fake&token_type=bearer&type=recovery';
    const landing = `https://getthehayout.com/#/change-password#${fragment}`;
    const cleaned = hrefWithCleanImplicitGrant(landing);

    expect(cleaned).toBe(`https://getthehayout.com/#${fragment}`);
    const parsed = parseParametersFromURL(cleaned);
    expect(parsed.access_token).toBe('at.fake');
    expect(parsed.refresh_token).toBe('rt.fake');
    expect(parsed.expires_in).toBe('3600');
    expect(parsed.token_type).toBe('bearer');
    expect(parsed.type).toBe('recovery');

    const arrival = readRecoveryArrival(landing);
    expect(arrival.type).toBe('recovery');
    expect(arrival.tokenHash).toBeNull();
    expect(readRecoveryArrival(cleaned).type).toBe('recovery');
    expect(decideAuthScreen({
      recoveryType: readRecoveryArrival(cleaned).type,
      pending: false,
      user: { id: 'user-1' },
    })).toBe('change-password');
    // No session yet: the screen stays login until the repaired URL is what
    // auth-js reads. That is why the rewrite runs before createClient.
    expect(decideAuthScreen({
      recoveryType: 'recovery',
      pending: false,
      user: null,
    })).toBe('auth');
  });

  it('repairs a percent-encoded second hash the same way', () => {
    const fragment = 'access_token=at.fake&expires_in=3600&refresh_token=rt.fake&token_type=bearer&type=recovery';
    const landing = `https://getthehayout.com/#/change-password%23${fragment}`;
    expect(hrefWithCleanImplicitGrant(landing)).toBe(`https://getthehayout.com/#${fragment}`);
    expect(parseParametersFromURL(hrefWithCleanImplicitGrant(landing)).access_token).toBe('at.fake');
    expect(readRecoveryArrival(landing).type).toBe('recovery');
  });

  it('leaves a clean implicit hash and ordinary routes unchanged', () => {
    const clean = 'https://getthehayout.com/#access_token=at.fake&refresh_token=rt.fake&expires_in=3600&token_type=bearer&type=recovery';
    expect(hrefWithCleanImplicitGrant(clean)).toBe(clean);
    expect(hrefWithCleanImplicitGrant('https://getthehayout.com/#/change-password')).toBe(
      'https://getthehayout.com/#/change-password',
    );
    expect(hrefWithCleanImplicitGrant('https://getthehayout.com/#/events')).toBe(
      'https://getthehayout.com/#/events',
    );
    expect(hrefWithCleanImplicitGrant('https://getthehayout.com/?token_hash=hashed-token&type=recovery')).toBe(
      'https://getthehayout.com/?token_hash=hashed-token&type=recovery',
    );
  });

  it('installs the repaired hash on the current location before auth-js parses it', () => {
    const fragment = 'access_token=at.fake&expires_in=3600&refresh_token=rt.fake&token_type=bearer&type=recovery';
    const prior = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState(
      null,
      '',
      `${window.location.origin}/#/change-password#${fragment}`,
    );
    installCleanRecoveryHash();
    const parsed = parseParametersFromURL(window.location.href);
    expect(parsed.access_token).toBe('at.fake');
    expect(parsed.type).toBe('recovery');
    expect(parsed.expires_in).toBe('3600');
    expect(parsed.token_type).toBe('bearer');
    expect(window.location.hash.startsWith('#/')).toBe(false);
    window.history.replaceState(null, '', prior || '/');
  });

  it('strips recovery query params and leaves an implicit-grant hash untouched', () => {
    const implicit = 'https://getthehayout.com/#access_token=abc&type=recovery';
    expect(hrefWithoutRecoverySearch(implicit)).toBe(implicit);

    expect(hrefWithoutRecoverySearch(
      'https://getthehayout.com/?token_hash=hashed-token&type=recovery#/change-password',
    )).toBe('https://getthehayout.com/#/change-password');
  });

  it('opens the change-password screen only for a signed-in recovery session', () => {
    const user = { id: 'user-1' };
    expect(decideAuthScreen({ recoveryType: 'recovery', pending: false, user })).toBe('change-password');
    expect(decideAuthScreen({ recoveryType: null, pending: true, user })).toBe('change-password');
    expect(decideAuthScreen({ recoveryType: null, pending: false, user })).toBe('app');
    expect(decideAuthScreen({ recoveryType: 'recovery', pending: true, user: null })).toBe('auth');
  });
});

describe('forgot password', () => {
  it('shows a forgot-password control on login and not on signup', () => {
    const container = mountLogin();
    expect(container.querySelector('[data-testid="auth-forgot"]').textContent).toBe('Forgot password?');

    container.querySelector('[data-testid="auth-toggle"]').click();
    expect(container.querySelector('[data-testid="auth-mode"]').textContent).toBe('Sign Up');
    expect(container.querySelector('[data-testid="auth-forgot"]')).toBeNull();
  });

  it('asks for an email and calls resetPasswordForEmail with the origin redirect', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const container = mountLogin();
    container.querySelector('[data-testid="auth-forgot"]').click();

    expect(container.querySelector('[data-testid="auth-mode"]').textContent).toBe('Reset password');
    expect(container.querySelector('[data-testid="header-build-stamp"]').textContent).toBe(buildStampLabel());

    const email = container.querySelector('[data-testid="auth-email"]');
    email.value = 'person@example.com';
    container.querySelector('[data-testid="auth-forgot-submit"]').click();

    const message = container.querySelector('[data-testid="auth-error"]');
    await vi.waitFor(() => {
      expect(message.textContent).toBe('Check your email for a password reset link.');
    });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('person@example.com', {
      redirectTo: passwordResetRedirectTo(),
    });
    expect(auth.resetPasswordForEmail.mock.calls[0][1].redirectTo.includes('#')).toBe(false);
    expect(message.classList.contains('auth-info')).toBe(true);
    expect(message.textContent).toBe('Check your email for a password reset link.');
  });

  it('does not call reset when the email is empty', async () => {
    const container = mountLogin();
    container.querySelector('[data-testid="auth-forgot"]').click();
    container.querySelector('[data-testid="auth-forgot-submit"]').click();
    await Promise.resolve();
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="auth-error"]').textContent).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('shows a generic failure when the request errors', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { message: 'rate limit' },
    });
    const container = mountLogin();
    container.querySelector('[data-testid="auth-forgot"]').click();
    container.querySelector('[data-testid="auth-email"]').value = 'person@example.com';
    container.querySelector('[data-testid="auth-forgot-submit"]').click();
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="auth-error"]').textContent).toBe(
        'Could not send the reset email. Try again.',
      );
    });
  });

  it('returns to the login form', () => {
    const container = mountLogin();
    container.querySelector('[data-testid="auth-forgot"]').click();
    container.querySelector('[data-testid="auth-back-to-login"]').click();
    expect(container.querySelector('[data-testid="auth-mode"]').textContent).toBe('Log In');
    expect(container.querySelector('[data-testid="auth-forgot"]')).toBeTruthy();
  });
});

describe('change password', () => {
  function mountChange(onSuccess = () => {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderChangePassword(container, onSuccess);
    return container;
  }

  it('shows the build stamp and collects a new password only', () => {
    const container = mountChange();
    expect(container.querySelector('[data-testid="auth-change-password"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="auth-mode"]').textContent).toBe('Change password');
    const passwords = container.querySelectorAll('input[type="password"]');
    expect(passwords).toHaveLength(2);
    expect(passwords[0].getAttribute('autocomplete')).toBe('new-password');
    expect(passwords[1].getAttribute('autocomplete')).toBe('new-password');
    expect(container.querySelector('[autocomplete="current-password"]')).toBeNull();
    const stamp = container.querySelector('[data-testid="header-build-stamp"]');
    expect(stamp.textContent).toBe(buildStampLabel());
    expect(stamp.closest('[data-testid="auth-overlay"]')).toBeTruthy();
  });

  it('does not call updateUser when the confirmation does not match', async () => {
    const container = mountChange();
    container.querySelector('[data-testid="auth-new-password"]').value = 'new-password';
    container.querySelector('[data-testid="auth-confirm-password"]').value = 'other-password';
    container.querySelector('[data-testid="auth-change-submit"]').click();
    await Promise.resolve();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="auth-error"]').textContent).toBe(
      'Passwords do not match.',
    );
  });

  it('updates the password and clears the recovery flag on success', async () => {
    markPasswordRecovery();
    auth.updateUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const onSuccess = vi.fn();
    const container = mountChange(onSuccess);
    container.querySelector('[data-testid="auth-new-password"]').value = 'new-password';
    container.querySelector('[data-testid="auth-confirm-password"]').value = 'new-password';
    container.querySelector('[data-testid="auth-change-submit"]').click();
    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({ id: 'user-1' });
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' });
    expect(isPasswordRecoveryPending()).toBe(false);
  });

  it('shows the auth error and stays on the form when updateUser fails', async () => {
    markPasswordRecovery();
    auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Password should be at least 6 characters' },
    });
    const onSuccess = vi.fn();
    const container = mountChange(onSuccess);
    container.querySelector('[data-testid="auth-new-password"]').value = 'short';
    container.querySelector('[data-testid="auth-confirm-password"]').value = 'short';
    container.querySelector('[data-testid="auth-change-submit"]').click();
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="auth-error"]').textContent).toBe(
        'Could not update the password. Password should be at least 6 characters',
      );
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(isPasswordRecoveryPending()).toBe(true);
    expect(container.querySelector('[data-testid="auth-change-submit"]').disabled).toBe(false);
  });

  it('shows Cancel in the same style as the other auth secondary actions', () => {
    const container = mountChange();
    const cancel = container.querySelector('[data-testid="auth-change-cancel"]');
    const login = mountLogin();
    expect(cancel.textContent).toBe('Cancel');
    expect(cancel.className).toBe('auth-toggle');
    expect(cancel.type).toBe('button');
    expect(cancel.className).toBe(login.querySelector('[data-testid="auth-forgot"]').className);
    expect(cancel.className).toBe(login.querySelector('[data-testid="auth-toggle"]').className);
  });

  it('cancel signs out, clears recovery, and returns to the login screen', async () => {
    markPasswordRecovery();
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    auth.signOut.mockResolvedValue({ error: null });
    await login('person@example.com', 'existing-password');
    expect(getUser()).toEqual({ id: 'user-1' });
    expect(isPasswordRecoveryPending()).toBe(true);

    const onSuccess = vi.fn();
    const onCancel = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderChangePassword(container, onSuccess, onCancel);
    container.querySelector('[data-testid="auth-new-password"]').value = 'typed-but-abandoned';
    container.querySelector('[data-testid="auth-confirm-password"]').value = 'typed-but-abandoned';

    container.querySelector('[data-testid="auth-change-cancel"]').click();

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="auth-mode"]').textContent).toBe('Log In');
    });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(getUser()).toBeNull();
    expect(isPasswordRecoveryPending()).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="auth-change-password"]')).toBeNull();
    expect(container.querySelector('[data-testid="auth-forgot"]')).toBeTruthy();
  });
});

describe('recovery session events', () => {
  it('marks recovery when auth-js emits PASSWORD_RECOVERY', () => {
    let handler;
    auth.onAuthStateChange.mockImplementation((cb) => {
      handler = cb;
      return { data: { subscription: { unsubscribe() {} } } };
    });
    const seen = [];
    onAuthChange((user, event) => seen.push({ user, event }));
    handler('PASSWORD_RECOVERY', { user: { id: 'user-1' } });
    expect(isPasswordRecoveryPending()).toBe(true);
    expect(seen).toEqual([{ user: { id: 'user-1' }, event: 'PASSWORD_RECOVERY' }]);
  });

  it('marks recovery after verifyOtp type=recovery succeeds', async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { user: { id: 'user-1' }, session: { user: { id: 'user-1' } } },
      error: null,
    });
    const result = await verifyRecoveryOtp('hashed-token');
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hashed-token',
      type: 'recovery',
    });
    expect(result.user).toEqual({ id: 'user-1' });
    expect(result.error).toBeNull();
    expect(isPasswordRecoveryPending()).toBe(true);
  });
});
