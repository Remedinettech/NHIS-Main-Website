import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import LoginPage from '../../pages/login/LoginPage';
import { canAccessPath } from '../../utils/capabilities';
import { safeRedirectPath } from '../../utils/redirect';
import { LoadingState } from '../common/StateViews';
import { Icon } from '../common/Icon';
import { LinkButton } from '../common/Button';
import { PageHeader } from '../common/PageHeader';

interface LocationState { from?: unknown }

function Splash() {
  return (
    <div className="page" style={{ maxWidth: '32rem' }}>
      <LoadingState label="Checking your session…" />
    </div>
  );
}

/** Wraps every workspace route. Without a session visitors go to /login and come back to the page they asked for. */
export function RequireSession() {
  const { status, signedOut } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'anonymous') {
    // After an explicit sign-out there is nothing to return to.
    const state = signedOut ? undefined : { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  return <Outlet />;
}

/** Blocks a route the signed-in role cannot use. Convenience only; the API enforces roles. */
export function RequireRoleForPath() {
  const { role } = useAuth();
  const location = useLocation();
  if (!canAccessPath(role, location.pathname)) {
    return (
      <div className="page">
        <PageHeader title="You do not have access to this section" intro="Your role does not include this area. Contact an administrator if you need access." />
        <LinkButton to="/dashboard" variant="secondary"><Icon name="arrowLeft" size={18} />Back to the dashboard</LinkButton>
      </div>
    );
  }
  return <Outlet />;
}

/** /login: the sign-in page, or a redirect when a session already exists. */
export function LoginRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'authenticated') {
    const state = location.state as LocationState | null;
    return <Navigate to={safeRedirectPath(state?.from)} replace />;
  }
  return <LoginPage />;
}
