import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import SiteLayout from '../components/layout/SiteLayout';
import { LEGACY_ALIASES, ROUTES } from '../config/routes';
import ContactsPage from '../pages/ContactsPage';
import ContentPage from '../pages/ContentPage';
import FormsPage from '../pages/FormsPage';
import GalleryPage from '../pages/GalleryPage';
import GovernmentOrdersPage from '../pages/GovernmentOrdersPage';
import GrievancesPage from '../pages/GrievancesPage';
import HomePage from '../pages/HomePage';
import HospitalsPage from '../pages/HospitalsPage';
import NotFoundPage from '../pages/NotFoundPage';

/** Keeps the query string and hash when an old path is redirected. */
function Redirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path={ROUTES.hospitals.slice(1)} element={<HospitalsPage />} />
        <Route
          path={ROUTES.employeePolicy.slice(1)}
          element={<ContentPage slug="employee-policy" titleKey="nav.employeePolicy" related={[
            { to: ROUTES.pensionerPolicy, labelKey: 'nav.pensionerPolicy' },
            { to: `${ROUTES.governmentOrders}#employee-orders`, labelKey: 'nav.governmentOrders' },
            { to: ROUTES.forms, labelKey: 'nav.forms' },
          ]} />}
        />
        <Route
          path={ROUTES.pensionerPolicy.slice(1)}
          element={<ContentPage slug="pensioner-policy" titleKey="nav.pensionerPolicy" related={[
            { to: ROUTES.employeePolicy, labelKey: 'nav.employeePolicy' },
            { to: `${ROUTES.governmentOrders}#pensioner-orders`, labelKey: 'nav.governmentOrders' },
            { to: ROUTES.forms, labelKey: 'nav.forms' },
          ]} />}
        />
        <Route path={ROUTES.governmentOrders.slice(1)} element={<GovernmentOrdersPage />} />
        <Route
          path={ROUTES.coverage.slice(1)}
          element={<ContentPage slug="coverage" titleKey="pages.coverageTitle" toc={false} related={[
            { to: ROUTES.eligibility, labelKey: 'nav.eligibility' },
            { to: ROUTES.employeePolicy, labelKey: 'nav.employeePolicy' },
            { to: ROUTES.pensionerPolicy, labelKey: 'nav.pensionerPolicy' },
          ]} />}
        />
        <Route
          path={ROUTES.eligibility.slice(1)}
          element={<ContentPage slug="eligibility" titleKey="pages.eligibilityTitle" toc={false} related={[
            { to: ROUTES.enrollment, labelKey: 'nav.enroll' },
            { to: ROUTES.coverage, labelKey: 'nav.coverage' },
          ]} />}
        />
        <Route
          path={ROUTES.enrollment.slice(1)}
          element={<ContentPage slug="how-to-enroll" titleKey="pages.enrollTitle" related={[
            { to: ROUTES.forms, labelKey: 'nav.forms' },
            { to: ROUTES.eligibility, labelKey: 'nav.eligibility' },
          ]} />}
        />
        <Route path={ROUTES.forms.slice(1)} element={<FormsPage />} />
        <Route path={ROUTES.contacts.slice(1)} element={<ContactsPage />} />
        <Route path={ROUTES.grievances.slice(1)} element={<GrievancesPage />} />
        <Route path={ROUTES.gallery.slice(1)} element={<GalleryPage />} />
        {LEGACY_ALIASES.map(([legacy, target]) => (
          <Route key={legacy} path={legacy} element={<Redirect to={target} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
