import { Navigate } from 'react-router-dom';

/**
 * The Settings page is retired: scheme name, helplines and portal links now live in the Site content documents
 * (header, homepage, navigation, footer) with draft, preview and publish. Old bookmarks of /settings land on the hub.
 */
export default function SettingsPage() {
  return <Navigate to="/site" replace />;
}
