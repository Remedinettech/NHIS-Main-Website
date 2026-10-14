import type { IconName } from '../components/common/Icon';

export interface NavItem { to: string; label: string; icon: IconName; /** Needs this capability (see utils/capabilities). */ requires?: 'users.manage' }

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/hospitals', label: 'Hospitals', icon: 'hospital' },
  { to: '/pages', label: 'Pages', icon: 'pages' },
  { to: '/documents', label: 'Documents', icon: 'file' },
  { to: '/contacts', label: 'Contacts', icon: 'phone' },
  { to: '/announcements', label: 'Announcements', icon: 'megaphone' },
  { to: '/gallery', label: 'Gallery', icon: 'image' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
  { to: '/users', label: 'Users', icon: 'users', requires: 'users.manage' },
  { to: '/activity', label: 'Activity', icon: 'activity' },
];
