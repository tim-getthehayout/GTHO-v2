/** @file Auth screen — login, signup, password reset request, and change password */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { buildStampLabel } from '../../ui/build-stamp.js';
import { login, signup, logout, requestPasswordReset, updatePassword } from './session.js';
import { clearPasswordRecovery } from './recovery.js';

/**
 * Shared card chrome. The build stamp matches the authenticated header.
 * The header is not mounted while this overlay is showing.
 *
 * @param {string} subtitle
 * @param {HTMLElement} body
 * @returns {HTMLElement}
 */
function authCard(subtitle, body) {
  return el('div', { className: 'auth-overlay', 'data-testid': 'auth-overlay' }, [
    el('div', { className: 'auth-card' }, [
      el('h1', { className: 'auth-title', 'data-testid': 'auth-title' }, [t('app.name')]),
      el('h2', { className: 'auth-subtitle', 'data-testid': 'auth-mode' }, [subtitle]),
      body,
      el('span', {
        className: 'header-build-stamp',
        'data-testid': 'header-build-stamp',
      }, [buildStampLabel()]),
    ]),
  ]);
}

/**
 * Render the auth overlay into the given container.
 * @param {HTMLElement} container
 * @param {Function} onSuccess - Called with user after successful auth
 */
export function renderAuthOverlay(container, onSuccess) {
  let mode = 'login'; // 'login' | 'signup' | 'forgot'

  function render() {
    clear(container);
    const subtitle = mode === 'login'
      ? t('auth.login')
      : mode === 'signup'
        ? t('auth.signup')
        : t('auth.resetTitle');
    const body = mode === 'forgot' ? buildForgotForm() : buildForm();
    container.appendChild(authCard(subtitle, body));
  }

  function buildForm() {
    const emailInput = el('input', {
      type: 'email',
      className: 'auth-input',
      placeholder: t('auth.email'),
      'data-testid': 'auth-email',
      autocomplete: 'email',
    });

    const passwordInput = el('input', {
      type: 'password',
      className: 'auth-input',
      placeholder: t('auth.password'),
      'data-testid': 'auth-password',
      autocomplete: mode === 'login' ? 'current-password' : 'new-password',
    });

    const confirmInput = mode === 'signup'
      ? el('input', {
        type: 'password',
        className: 'auth-input',
        placeholder: t('auth.confirmPassword'),
        'data-testid': 'auth-confirm-password',
        autocomplete: 'new-password',
      })
      : null;

    const errorEl = el('div', {
      className: 'auth-error',
      'data-testid': 'auth-error',
    });

    const submitBtn = el('button', {
      className: 'btn btn-green auth-submit',
      type: 'button',
      'data-testid': 'auth-submit',
      onClick: () => handleSubmit(emailInput, passwordInput, confirmInput, errorEl, submitBtn),
    }, [mode === 'login' ? t('auth.login') : t('auth.signup')]);

    const forgotBtn = mode === 'login'
      ? el('button', {
        className: 'auth-toggle',
        type: 'button',
        'data-testid': 'auth-forgot',
        onClick: () => {
          mode = 'forgot';
          render();
        },
      }, [t('auth.forgotPassword')])
      : null;

    const toggleBtn = el('button', {
      className: 'auth-toggle',
      type: 'button',
      'data-testid': 'auth-toggle',
      onClick: () => {
        mode = mode === 'login' ? 'signup' : 'login';
        render();
      },
    }, [mode === 'login' ? t('auth.switchToSignup') : t('auth.switchToLogin')]);

    const children = [emailInput, passwordInput];
    if (confirmInput) children.push(confirmInput);
    children.push(errorEl, submitBtn);
    if (forgotBtn) children.push(forgotBtn);
    children.push(toggleBtn);

    return el('form', {
      className: 'auth-form',
      'data-testid': 'auth-form',
      onSubmit: (e) => {
        e.preventDefault();
        handleSubmit(emailInput, passwordInput, confirmInput, errorEl, submitBtn);
      },
    }, children);
  }

  function buildForgotForm() {
    const emailInput = el('input', {
      type: 'email',
      className: 'auth-input',
      placeholder: t('auth.email'),
      'data-testid': 'auth-email',
      autocomplete: 'email',
    });

    const errorEl = el('div', {
      className: 'auth-error',
      'data-testid': 'auth-error',
    });

    const submitBtn = el('button', {
      className: 'btn btn-green auth-submit',
      type: 'button',
      'data-testid': 'auth-forgot-submit',
      onClick: () => handleForgot(emailInput, errorEl, submitBtn),
    }, [t('auth.sendResetLink')]);

    const backBtn = el('button', {
      className: 'auth-toggle',
      type: 'button',
      'data-testid': 'auth-back-to-login',
      onClick: () => {
        mode = 'login';
        render();
      },
    }, [t('auth.backToLogin')]);

    return el('form', {
      className: 'auth-form',
      'data-testid': 'auth-form',
      onSubmit: (e) => {
        e.preventDefault();
        handleForgot(emailInput, errorEl, submitBtn);
      },
    }, [emailInput, errorEl, submitBtn, backBtn]);
  }

  async function handleForgot(emailInput, errorEl, submitBtn) {
    const email = emailInput.value.trim();
    clear(errorEl);
    errorEl.className = 'auth-error';

    if (!email) {
      errorEl.appendChild(el('span', {}, [t('error.generic')]));
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = t('auth.sendingReset');

    const { error } = await requestPasswordReset(email);
    clear(errorEl);
    if (error) {
      errorEl.appendChild(el('span', {}, [t('auth.resetFailed')]));
      submitBtn.disabled = false;
      submitBtn.textContent = t('auth.sendResetLink');
      return;
    }

    errorEl.className = 'auth-info';
    errorEl.appendChild(el('span', {}, [t('auth.resetEmailSent')]));
    submitBtn.disabled = false;
    submitBtn.textContent = t('auth.sendResetLink');
  }

  async function handleSubmit(emailInput, passwordInput, confirmInput, errorEl, submitBtn) {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    clear(errorEl);

    if (!email || !password) {
      errorEl.appendChild(el('span', {}, [t('error.generic')]));
      return;
    }

    if (mode === 'signup') {
      const confirm = confirmInput?.value;
      if (password !== confirm) {
        errorEl.appendChild(el('span', {}, [t('auth.passwordMismatch')]));
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'login' ? t('auth.loggingIn') : t('auth.signingUp');

    if (mode === 'login') {
      const { user, error } = await login(email, password);
      if (error) {
        clear(errorEl);
        errorEl.appendChild(el('span', {}, [t('auth.loginFailed')]));
        submitBtn.disabled = false;
        submitBtn.textContent = t('auth.login');
      } else {
        onSuccess(user);
      }
    } else {
      const { user, error, needsConfirmation } = await signup(email, password);
      if (error) {
        clear(errorEl);
        errorEl.appendChild(el('span', {}, [t('auth.signupFailed', { error })]));
        submitBtn.disabled = false;
        submitBtn.textContent = t('auth.signup');
      } else if (needsConfirmation) {
        clear(errorEl);
        errorEl.className = 'auth-info';
        errorEl.appendChild(el('span', {}, [t('auth.checkEmail')]));
        submitBtn.disabled = false;
        submitBtn.textContent = t('auth.signup');
      } else {
        onSuccess(user);
      }
    }
  }

  render();
}

/**
 * Change-password screen for a recovery session.
 * The session is already signed in. Success clears the recovery flag and
 * calls onSuccess so boot can open the app without signing out.
 * Cancel abandons the reset: signs out, clears the recovery flag, and
 * shows the login screen. The recovery session is ended.
 *
 * @param {HTMLElement} container
 * @param {Function} onSuccess - Called with user after the password is updated
 * @param {Function} [onCancel] - Called after sign-out. Boot uses this to show login.
 */
export function renderChangePassword(container, onSuccess, onCancel) {
  const passwordInput = el('input', {
    type: 'password',
    className: 'auth-input',
    placeholder: t('auth.newPassword'),
    'data-testid': 'auth-new-password',
    autocomplete: 'new-password',
  });

  const confirmInput = el('input', {
    type: 'password',
    className: 'auth-input',
    placeholder: t('auth.confirmPassword'),
    'data-testid': 'auth-confirm-password',
    autocomplete: 'new-password',
  });

  const errorEl = el('div', {
    className: 'auth-error',
    'data-testid': 'auth-error',
  });

  const submitBtn = el('button', {
    className: 'btn btn-green auth-submit',
    type: 'button',
    'data-testid': 'auth-change-submit',
    onClick: () => submit(),
  }, [t('auth.changePasswordSubmit')]);

  const cancelBtn = el('button', {
    className: 'auth-toggle',
    type: 'button',
    'data-testid': 'auth-change-cancel',
    onClick: () => cancel(),
  }, [t('auth.cancel')]);

  async function submit() {
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    clear(errorEl);
    errorEl.className = 'auth-error';

    if (!password) {
      errorEl.appendChild(el('span', {}, [t('error.generic')]));
      return;
    }

    if (password !== confirm) {
      errorEl.appendChild(el('span', {}, [t('auth.passwordMismatch')]));
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = t('auth.changingPassword');

    const { user, error } = await updatePassword(password);
    if (error) {
      clear(errorEl);
      errorEl.appendChild(el('span', {}, [t('auth.passwordUpdateFailed', { error })]));
      submitBtn.disabled = false;
      submitBtn.textContent = t('auth.changePasswordSubmit');
      return;
    }

    clearPasswordRecovery();
    onSuccess(user);
  }

  async function cancel() {
    cancelBtn.disabled = true;
    await logout();
    clearPasswordRecovery();
    clear(container);
    // Login screen for this tab. A later login() notifies onAuthChange, which
    // opens the app. Boot's onCancel mounts the usual login overlay in its place.
    renderAuthOverlay(container, () => {});
    if (typeof onCancel === 'function') onCancel();
  }

  const form = el('form', {
    className: 'auth-form',
    'data-testid': 'auth-change-password',
    onSubmit: (e) => {
      e.preventDefault();
      submit();
    },
  }, [passwordInput, confirmInput, errorEl, submitBtn, cancelBtn]);

  clear(container);
  container.appendChild(authCard(t('auth.changePassword'), form));
}
