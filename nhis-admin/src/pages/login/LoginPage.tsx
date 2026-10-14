import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../../components/common/BrandLogo';
import { Icon } from '../../components/common/Icon';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { describeLoginError } from '../../utils/loginError';
import { safeRedirectPath } from '../../utils/redirect';
import { validateLoginForm, type LoginFieldErrors } from '../../utils/validation';
import './login.css';

interface LocationState { from?: unknown }

export default function LoginPage() {
  useDocumentTitle('Admin Login');
  const { signIn, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<LoginFieldErrors>({});
  const [failure, setFailure] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setFailure(undefined);
    const found = validateLoginForm(email, password);
    setErrors(found);
    if (found.email) { emailRef.current?.focus(); return; }
    if (found.password) { passwordRef.current?.focus(); return; }
    setSubmitting(true);
    try {
      await signIn(email, password);
      const state = location.state as LocationState | null;
      navigate(safeRedirectPath(state?.from), { replace: true });
    } catch (error) {
      const result = describeLoginError(error);
      setFailure(result.message);
      if (result.credentials) setPassword('');
      passwordRef.current?.focus();
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <div className="login__brand">
        <svg className="login__art" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          <g fill="none" stroke="#8fcdf3" strokeOpacity="0.22" strokeWidth="1.5">
            <circle cx="520" cy="130" r="110" />
            <circle cx="520" cy="130" r="170" />
            <circle cx="520" cy="130" r="230" />
            <path d="M-40 640 L180 520 L400 640 L620 520" />
            <path d="M-40 700 L180 580 L400 700 L620 580" />
          </g>
          <g fill="#0072bb">
            <rect x="60" y="560" width="120" height="120" rx="14" fillOpacity="0.22" transform="rotate(12 120 620)" />
            <circle cx="470" cy="610" r="64" fillOpacity="0.2" />
            <rect x="330" y="690" width="90" height="90" rx="12" fillOpacity="0.14" transform="rotate(-10 375 735)" />
          </g>
        </svg>
        <div className="login__brand-inner">
          <BrandLogo variant="login" />
          <p className="login__welcome">Welcome to the administration workspace for the Tamil Nadu New Health Insurance Scheme website.</p>
        </div>
      </div>

      <main className="login__panel">
        <div className="login__panel-inner">
          <div className="login__compact-brand"><BrandLogo variant="compact" /></div>
          <h1>Admin Login</h1>
          <p className="login__intro">Welcome back. Sign in to manage hospitals, documents, contacts and site content.</p>

          <form className="login-form" onSubmit={(event) => void onSubmit(event)} noValidate>
            {sessionExpired && !failure && (
              <div className="login-form__alert login-form__alert--info" role="status">
                <Icon name="info" size={20} />
                <p>Your session has ended. Sign in again to continue.</p>
              </div>
            )}
            {failure && (
              <div className="login-form__alert" role="alert">
                <Icon name="alert" size={20} />
                <p>{failure}</p>
              </div>
            )}

            <div className="form-field">
              <label htmlFor="login-email">Email</label>
              <input
                ref={emailRef}
                id="login-email"
                name="email"
                type="email"
                value={email}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                onChange={(e) => { setEmail(e.target.value); setErrors((c) => ({ ...c, email: undefined })); setFailure(undefined); }}
              />
              {errors.email && <p id="login-email-error" className="form-field__error">{errors.email}</p>}
            </div>

            <div className="form-field">
              <label htmlFor="login-password">Password</label>
              <div className="password-box">
                <input
                  ref={passwordRef}
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={errors.password ? 'login-password-error' : undefined}
                  onChange={(e) => { setPassword(e.target.value); setErrors((c) => ({ ...c, password: undefined })); setFailure(undefined); }}
                />
                <button type="button" className="password-box__toggle" aria-pressed={showPassword} aria-label="Show password" onClick={() => setShowPassword((v) => !v)}>
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={20} />
                </button>
              </div>
              {errors.password && <p id="login-password-error" className="form-field__error">{errors.password}</p>}
            </div>

            <button type="submit" className="login-form__submit" disabled={submitting} aria-busy={submitting || undefined}>
              {submitting ? 'Signing in…' : 'Sign in'}
              {!submitting && <Icon name="arrowRight" size={18} />}
            </button>
          </form>

          <p className="login__help">Contact an administrator to reset your password.</p>
        </div>
      </main>
    </div>
  );
}
