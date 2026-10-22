/** Public route paths. Legacy tn-nhis.com paths are mapped by LEGACY_ALIASES below (routes/index.tsx redirects them). */
export const ROUTES = {
  home: '/',
  userManual: '/user-manual',
  hospitals: '/hospitals',
  employeePolicy: '/employee-policy',
  pensionerPolicy: '/pensioner-policy',
  governmentOrders: '/government-orders',
  coverage: '/coverage',
  eligibility: '/eligibility',
  enrollment: '/enrollment',
  forms: '/forms',
  contacts: '/contacts',
  grievances: '/grievances',
  gallery: '/gallery',
} as const;

export type RouteKey = keyof typeof ROUTES;

/**
 * Legacy source paths (case-insensitive) and the new route each one resolves to.
 * Includes the source's misspelled `/Home/Froms_Download` path as an alias.
 */
export const LEGACY_ALIASES: ReadonlyArray<readonly [legacyPath: string, target: string]> = [
  ['Home/Index', ROUTES.home],
  ['Account/Hospitallist', ROUTES.hospitals],
  ['Account/Employeesscheme', ROUTES.employeePolicy],
  ['Account/Pensionersscheme', ROUTES.pensionerPolicy],
  ['Home/Coverage', ROUTES.coverage],
  ['Home/Eligibility', ROUTES.eligibility],
  ['Account/HowtoEnrol', ROUTES.enrollment],
  ['Home/Froms_Download', ROUTES.forms],
  ['Home/Gallery', ROUTES.gallery],
  ['Home/Grievances', ROUTES.grievances],
  ['Account/Contact', ROUTES.contacts],
  // Routes used by the earlier starter
  ['documents', ROUTES.forms],
  ['contact', ROUTES.contacts],
  ['enroll', ROUTES.enrollment],
  ['how-to-enroll', ROUTES.enrollment],
];
