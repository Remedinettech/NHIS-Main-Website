import type { IconName } from '../components/common/Icon';

export interface NavItem { to: string; label: string; description?: string; icon: IconName; /** Needs this capability (see utils/capabilities). */ requires?: 'users.manage' }

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/dashboard', label: 'Overview', icon: 'dashboard' },
  { to: '/hospitals', label: 'Network hospitals', icon: 'hospital' },
  { to: '/pages', label: 'Website pages', description: 'Policies, grievances, text & tables', icon: 'pages' },
  { to: '/documents', label: 'Documents & downloads', icon: 'file' },
  { to: '/contacts', label: 'Contact directories', description: 'Coordinators & office officials', icon: 'phone' },
  { to: '/announcements', label: 'Website notices', icon: 'megaphone' },
  { to: '/gallery', label: 'Photo gallery', icon: 'image' },
  { to: '/site', label: 'Website content', description: 'Header, menu, footer & videos', icon: 'layout' },
  { to: '/imports', label: 'Import Excel', description: 'Validate and import record drafts', icon: 'file' },
  { to: '/users', label: 'Staff accounts', icon: 'users', requires: 'users.manage' },
  { to: '/activity', label: 'Change history', icon: 'activity' },
];
