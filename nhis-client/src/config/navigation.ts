import type { MessageKey } from '../locales';
import { PORTALS } from './portals';
import { ROUTES } from './routes';

export interface NavLinkItem {
  kind: 'link';
  id: string;
  labelKey: MessageKey;
  /** Internal route */
  to?: string;
  /** External destination (existing NHIS portal) */
  href?: string;
}
export interface NavHeading { kind: 'heading'; id: string; labelKey: MessageKey }
export interface NavMenuItem { kind: 'menu'; id: string; labelKey: MessageKey; children: ReadonlyArray<NavLinkItem | NavHeading> }
export type NavItem = NavLinkItem | NavMenuItem;

const link = (id: string, labelKey: MessageKey, to: string): NavLinkItem => ({ kind: 'link', id, labelKey, to });

/** Primary navigation, following the source site's structure: Scheme > Policy Details / Govt Orders, Beneficiary > Track Claim. */
export const PRIMARY_NAV: ReadonlyArray<NavItem> = [
  link('home', 'nav.home', ROUTES.home),
  link('hospitals', 'nav.hospitals', ROUTES.hospitals),
  {
    kind: 'menu', id: 'scheme', labelKey: 'nav.scheme',
    children: [
      { kind: 'heading', id: 'policy', labelKey: 'nav.policyDetails' },
      link('employee-policy', 'nav.employeePolicy', ROUTES.employeePolicy),
      link('pensioner-policy', 'nav.pensionerPolicy', ROUTES.pensionerPolicy),
      { kind: 'heading', id: 'orders', labelKey: 'nav.governmentOrders' },
      link('government-orders', 'nav.governmentOrders', ROUTES.governmentOrders),
      { kind: 'heading', id: 'about', labelKey: 'nav.scheme' },
      link('coverage', 'nav.coverage', ROUTES.coverage),
      link('eligibility', 'nav.eligibility', ROUTES.eligibility),
      link('enroll', 'nav.enroll', ROUTES.enrollment),
      link('forms', 'nav.forms', ROUTES.forms),
    ],
  },
  {
    kind: 'menu', id: 'beneficiary', labelKey: 'nav.beneficiary',
    children: [{ kind: 'link', id: 'track-claim', labelKey: 'nav.trackClaim', href: PORTALS.trackClaim.href }],
  },
  link('gallery', 'nav.gallery', ROUTES.gallery),
  link('grievances', 'nav.grievances', ROUTES.grievances),
  link('contacts', 'nav.contact', ROUTES.contacts),
];

/** Links repeated in the footer. */
export const FOOTER_LINKS: ReadonlyArray<NavLinkItem> = [
  link('hospitals', 'nav.hospitals', ROUTES.hospitals),
  link('employee-policy', 'nav.employeePolicy', ROUTES.employeePolicy),
  link('pensioner-policy', 'nav.pensionerPolicy', ROUTES.pensionerPolicy),
  link('government-orders', 'nav.governmentOrders', ROUTES.governmentOrders),
  link('coverage', 'nav.coverage', ROUTES.coverage),
  link('eligibility', 'nav.eligibility', ROUTES.eligibility),
  link('enroll', 'nav.enroll', ROUTES.enrollment),
  link('forms', 'nav.forms', ROUTES.forms),
  link('gallery', 'nav.gallery', ROUTES.gallery),
  link('grievances', 'nav.grievances', ROUTES.grievances),
  link('contacts', 'nav.contact', ROUTES.contacts),
];
