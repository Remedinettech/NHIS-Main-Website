import UserManualPage from '../pages/site/UserManualPage';
import ImportPage from '../pages/imports/ImportPage';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginRoute, RequireRoleForPath, RequireSession } from '../components/auth/RouteGuards';
import AdminLayout from '../components/layout/AdminLayout';
import ActivityPage from '../pages/activity/ActivityPage';
import AnnouncementEditPage from '../pages/announcements/AnnouncementEditPage';
import AnnouncementsPage from '../pages/announcements/AnnouncementsPage';
import ContactEditPage from '../pages/contacts/ContactEditPage';
import ContactsPage from '../pages/contacts/ContactsPage';
import DashboardPage from '../pages/dashboard/DashboardPage';
import DocumentEditPage from '../pages/documents/DocumentEditPage';
import DocumentsPage from '../pages/documents/DocumentsPage';
import GalleryEditPage from '../pages/gallery/GalleryEditPage';
import GalleryPage from '../pages/gallery/GalleryPage';
import HospitalEditPage from '../pages/hospitals/HospitalEditPage';
import HospitalsPage from '../pages/hospitals/HospitalsPage';
import NotFoundPage from '../pages/NotFoundPage';
import PageEditPage from '../pages/pages/PageEditPage';
import PagesListPage from '../pages/pages/PagesListPage';
import SettingsPage from '../pages/settings/SettingsPage';
import FooterPage from '../pages/site/FooterPage';
import HeaderPage from '../pages/site/HeaderPage';
import HomeEditPage from '../pages/site/HomeEditPage';
import NavigationPage from '../pages/site/NavigationPage';
import PartnersPage from '../pages/site/PartnersPage';
import SiteHubPage from '../pages/site/SiteHubPage';
import TextPage from '../pages/site/TextPage';
import UsersPage from '../pages/users/UsersPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginRoute />} />
      <Route element={<RequireSession />}>
        <Route element={<AdminLayout />}>
          <Route element={<RequireRoleForPath />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="imports" element={<ImportPage />} />
            <Route path="hospitals" element={<HospitalsPage />} />
            <Route path="hospitals/new" element={<HospitalEditPage />} />
            <Route path="hospitals/:id" element={<HospitalEditPage />} />
            <Route path="pages" element={<PagesListPage />} />
            <Route path="pages/:slug" element={<PageEditPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="documents/new" element={<DocumentEditPage />} />
            <Route path="documents/:id" element={<DocumentEditPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="contacts/new" element={<ContactEditPage />} />
            <Route path="contacts/:id" element={<ContactEditPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="announcements/new" element={<AnnouncementEditPage />} />
            <Route path="announcements/:id" element={<AnnouncementEditPage />} />
            <Route path="gallery" element={<GalleryPage />} />
            <Route path="gallery/new" element={<GalleryEditPage />} />
            <Route path="gallery/:id" element={<GalleryEditPage />} />
            <Route path="site" element={<SiteHubPage />} />
            <Route path="site/manual" element={<UserManualPage />} />
            <Route path="site/header" element={<HeaderPage />} />
            <Route path="site/navigation" element={<NavigationPage />} />
            <Route path="site/home" element={<HomeEditPage />} />
            <Route path="site/partners" element={<PartnersPage />} />
            <Route path="site/footer" element={<FooterPage />} />
            <Route path="site/text" element={<TextPage />} />
            {/* The retired Settings page: its values now live in the Site content documents. */}
            <Route path="settings" element={<SettingsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
