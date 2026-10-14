import type { MessageKey } from '../locales';
import { APP_CONFIG } from './app';

/**
 * Existing NHIS portal destinations. These are the real operational portals;
 * the redesigned site only links to them and never simulates a login or claim flow.
 * Destinations are copied from the captured source site (inventory.json).
 */
export interface PortalLink {
  id: 'employee' | 'pensioner' | 'administrator' | 'insurer' | 'trackClaim' | 'forgotPassword'
    | 'hospitalMediAssist' | 'hospitalMdIndia';
  /** Message key (locales) for the link label. */
  labelKey: MessageKey;
  href: string;
}

const legacy = (path: string) => `${APP_CONFIG.legacyPortalBaseUrl}${path}`;

export const PORTALS: Record<PortalLink['id'], PortalLink> = {
  employee: { id: 'employee', labelKey: 'login.employees', href: legacy('/?Pagename=TNportal') },
  pensioner: { id: 'pensioner', labelKey: 'login.pensioners', href: legacy('/?Pagename=Pensioners') },
  administrator: { id: 'administrator', labelKey: 'login.administrator', href: legacy('/?Pagename=Administrator') },
  insurer: { id: 'insurer', labelKey: 'login.insurer', href: legacy('/?Pagename=TNportal') },
  trackClaim: { id: 'trackClaim', labelKey: 'nav.trackClaim', href: legacy('/?Pagename=TNportal') },
  forgotPassword: { id: 'forgotPassword', labelKey: 'login.forgotPassword', href: legacy('/Account/ForgetPassword') },
  hospitalMediAssist: { id: 'hospitalMediAssist', labelKey: 'login.hospitalMediAssist', href: 'https://provider.ihx.in/' },
  hospitalMdIndia: { id: 'hospitalMdIndia', labelKey: 'login.hospitalMdIndia', href: 'https://tnnhis2016.com/' },
};

/** Order shown in the login menu. */
export const LOGIN_MENU_ORDER: ReadonlyArray<PortalLink['id']> = [
  'employee', 'pensioner', 'administrator', 'insurer', 'hospitalMediAssist', 'hospitalMdIndia',
];
