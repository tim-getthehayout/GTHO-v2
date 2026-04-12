/** @file Auth screen — login/signup forms with toggle */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { login, signup } from './session.js';

/**
 * Render the auth overlay into the given container.
 * @param {HTMLElement} container
 * @param {Function} onSuccess - Called with user after successful auth
 */
export function renderAuthOverlay(container, onSuccess) {
  let mode = 'login'; // 'login' | 'signup'

  function render() {
    clear(container);

    const overlay = el('div', { className: 'auth-overlay', 'data-testid': 'auth-overlay' }, [
      el('div', { className: 'auth-card' }, [
        el('h1', { className: 'auth-title', 'data-testid': 'auth-title' }, [t('app.name')]),
        el('h2', { className: 'auth-subtitle', 'data-testid': 'auth-mode' }, [
          mode === 'login' ? t('auth.login') : t('auth.signup'),
        ]),
        buildForm(),
      ]),
    ]);

    container.appendChild(overlay);
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
    children.push(errorEl, submitBtn, toggleBtn);

    return el('form', {
      className: 'auth-form',
      'data-testid': 'auth-form',
      onSubmit: (e) => {
        e.preventDefault();
        handleSubmit(emailInput, passwordInput, confirmInput, errorEl, submitBtn);
      },
    }, children);
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
