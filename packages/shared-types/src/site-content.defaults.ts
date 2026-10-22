import { DEFAULT_USER_MANUAL } from './user-manual';
import type { Bilingual, DocumentCategory } from './content.types';
import { HOME_SECTION_IDS } from './site-content.constants';
import type {
  HelplineEntry, LinkItem, LinkTarget, NavHeading, NavLink, NavMenu, PartnerEntry, PathwayGroup, PathwayLink,
  QuickTile, SiteContentKey, SiteContentMap, SiteIconName, SiteImage,
} from './site-content.types';

/* ---------------------------------------------------------------------------
 * Built-in content: exactly what the Client had hard-coded before the site content became editable
 * (nhis-client SiteHeader, PrimaryNav, LoginMenu, SupportStrip, SiteFooter and the home page sections), in English
 * and Tamil. Nothing here is invented: the texts are the Client's locale messages (English from en.ts; Tamil from
 * ta.source.ts, else ta.proposed.ts) and the helplines and scheme name of nhis-api/src/data/site.json. A new text
 * that never existed has English only (Tamil '' shows the English text).
 * nhis-client/src/config/siteContentDefaults.test.ts compares this file with the locale files and the data files.
 * ------------------------------------------------------------------------- */

const bi = (en: string, ta = ''): Bilingual => ({ en, ta });
const route = (path: string): LinkTarget => ({ type: 'route', path });
const external = (url: string): LinkTarget => ({ type: 'external', url });
const link = (id: string, label: Bilingual, target: LinkTarget): LinkItem => ({ id, label, target, visible: true });
const image = (builtIn: string, width: number, height: number, alt: Bilingual): SiteImage =>
  ({ assetId: null, builtIn, alt, width, height });

/** Client interface messages used by the content below, named like the message keys (nav.home is M.nav.home). */
const M = {
  site: {
    emblemAlt: bi('Tamil Nadu government emblem', 'தமிழ்நாடு அரசு சின்னம்'),
    portraitAlt: bi('Portrait displayed in the site header', 'தளத்தின் தலைப்புப் பகுதியில் காட்டப்படும் உருவப்படம்'),
  },
  support: {
    helpline: bi('24*7 Help Line (Toll Free Number)', '24*7 உதவி எண் (கட்டணமில்லா எண்)'),
  },
  nav: {
    home: bi('Home', 'முகப்பு'),
    hospitals: bi('Network Hospital', 'அங்கிகரிக்கபட்ட மருத்துவமனைகள்'),
    scheme: bi('Scheme', 'திட்டம்'),
    policyDetails: bi('Policy Details', 'கொள்கை விவரங்கள்'),
    employeePolicy: bi('Employee', 'ஊழியர்'),
    pensionerPolicy: bi('Pensioner', 'ஓய்வூதியதாரர்'),
    governmentOrders: bi('Govt Orders', 'அரசு ஆணைகள்'),
    coverage: bi('Coverage', 'காப்புறு'),
    eligibility: bi('Eligibility', 'தகுதி'),
    enroll: bi('How to Enroll', 'பதிவு செய்வது எப்படி'),
    forms: bi('Forms Download', 'படிவங்கள் பதிவிறக்கம்'),
    beneficiary: bi('Beneficiary', 'பயனாளி'),
    trackClaim: bi('Track Claim', 'உரிமைகோரலைக் கண்காணிக்கவும்'),
    gallery: bi('Gallery', 'கேலரி'),
    grievances: bi('Grievances', 'குறைதீர்ப்பு'),
    contact: bi('Contact', 'தொடர்பு கொள்ளவும்'),
  },
  login: {
    menu: bi('Login', 'உள்நுழைய'),
    employees: bi('Employees', 'பணியாளர்கள்'),
    pensioners: bi('Pensioners', 'ஓய்வூதியம் பெறுவோர்'),
    administrator: bi('Hospital Login', 'மருத்துவமனை உள்நுழைவு'),
    insurer: bi('Insurer', 'காப்பீட்டாளர்'),
    forgotPassword: bi('Forgot Password?', 'கடவுச்சொல்லை மறந்துவிட்டீர்களா?'),
    roleHeading: bi('Sign in as', 'இவ்வாறு உள்நுழைக'),
  },
  home: {
    eyebrow: bi('Health insurance for government employees and pensioners', 'அரசு ஊழியர்கள் மற்றும் ஓய்வூதியதாரர்களுக்கான மருத்துவக் காப்பீடு'),
    coverageHeading: bi('Coverage', 'காப்பீடு'),
    coverageDetails: bi('Read coverage details', 'காப்பீட்டு விவரங்களைப் படிக்க'),
    findHospital: bi('Find a network hospital', 'அங்கீகரிக்கப்பட்ட மருத்துவமனையைக் கண்டறிக'),
    findHospitalHint: bi('Search by hospital name, address, district or specialty in English or Tamil.', 'மருத்துவமனை பெயர், முகவரி, மாவட்டம் அல்லது சிறப்புப் பிரிவு மூலம் ஆங்கிலம் அல்லது தமிழில் தேடலாம்.'),
    searchPlaceholder: bi('Hospital name, address or specialty', 'மருத்துவமனை பெயர், முகவரி அல்லது சிறப்புப் பிரிவு'),
    searchButton: bi('Search hospitals', 'மருத்துவமனைகளைத் தேடு'),
    browseAllHospitals: bi('Browse all network hospitals', 'அனைத்து மருத்துவமனைகளையும் காண்க'),
    pathwaysHeading: bi('Choose your pathway', 'உங்கள் வழியைத் தேர்ந்தெடுக்கவும்'),
    employeePath: bi('For employees', 'ஊழியர்களுக்கு'),
    pensionerPath: bi('For pensioners', 'ஓய்வூதியதாரர்களுக்கு'),
    employeePolicy: bi('Employee policy details', 'ஊழியர் கொள்கை விவரங்கள்'),
    pensionerPolicy: bi('Pensioner policy details', 'ஓய்வூதியதாரர் கொள்கை விவரங்கள்'),
    govOrders: bi('Government orders', 'அரசாணைகள்'),
    enrolForm: bi('Enrolment annexure form', 'பதிவுப் படிவ இணைப்பு'),
    employeeLogin: bi('Employee portal', 'ஊழியர் தளம்'),
    pensionerLogin: bi('Pensioner portal', 'ஓய்வூதியதாரர் தளம்'),
    quickHeading: bi('Quick access', 'விரைவு அணுகல்'),
    quickTrackHint: bi('NHIS portal', 'NHIS தளம்'),
    documentsHeading: bi('Documents and forms', 'ஆவணங்களும் படிவங்களும்'),
    documentsIntro: bi('Enrolment forms and policy lists for download.', 'பதிவுப் படிவங்களும் கொள்கைப் பட்டியல்களும் பதிவிறக்கத்திற்கு.'),
    allOrders: bi('View all government orders', 'அனைத்து அரசாணைகளையும் காண்க'),
    allForms: bi('All forms and downloads', 'அனைத்து படிவங்கள் மற்றும் பதிவிறக்கங்கள்'),
    partnersHeading: bi('Partners', 'கூட்டாளிகள்'),
    insurancePartner: bi('Insurance Partner', 'காப்பீட்டு நிறுவனம்'),
    servicePartner: bi('Service Partner', 'சேவை நிறுவனங்கள்'),
    helplineHeading: bi('Help and support', 'உதவி மற்றும் ஆதரவு'),
    helplineIntro: bi('Toll-free helplines for employees and pensioners.', 'ஊழியர்கள் மற்றும் ஓய்வூதியதாரர்களுக்கான கட்டணமில்லா உதவி எண்கள்.'),
  },
  pages: {
    coverageTitle: bi('Coverage', 'கவரேஜ்'),
  },
  footer: {
    about: bi('Tamil Nadu New Health Insurance Scheme', 'தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம்'),
    aboutText: bi('Health insurance cover for government employees, pensioners and their eligible family members, implemented through United India Insurance with Vidal Health, Medi Assist and Health Insurance TPA of India (HITPA) as service partners.', 'அரசு ஊழியர்கள், ஓய்வூதியதாரர்கள் மற்றும் அவர்களின் தகுதியுடைய குடும்ப உறுப்பினர்களுக்கான மருத்துவக் காப்பீடு; யுனைடெட் இந்தியா இன்சூரன்ஸ் மூலம் செயல்படுத்தப்படுகிறது, விடல் ஹெல்த், மெடி அசிஸ்ட் மற்றும் ஹெல்த் இன்சூரன்ஸ் டிபிஏ ஆஃப் இந்தியா (HITPA) ஆகியவை சேவைக் கூட்டாளிகளாக உள்ளன.'),
    quickLinks: bi('Quick links', 'விரைவு இணைப்புகள்'),
    portals: bi('NHIS portals', 'NHIS தளங்கள்'),
    helplines: bi('Helplines', 'உதவி எண்கள்'),
    portalSite: bi('NHIS portal (tn-nhis.com)', 'NHIS தளம் (tn-nhis.com)'),
    rights: bi('Tamil Nadu New Health Insurance Scheme', 'தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம்'),
  },
};

/** Scheme name, coverage statement, helplines and availability as published (nhis-api/src/data/site.json). */
const SCHEME_NAME = bi('Tamil Nadu New Health Insurance Scheme', 'தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டு திட்டம்');
const COVERAGE_STATEMENT = bi('Upto 5 Lakh Health Cover per Employee / Pensioner Family', 'அரசு ஊழியர் / ஓய்வூதியதாரர் குடும்பத்திற்கு ரூபாய் 5 லட்சம் வரை மருத்துவக் காப்பீடு');
const HELPLINES: HelplineEntry[] = [
  { id: 'employee', label: bi('Employee', 'பணியாளர்'), number: '1800-233-5666', visible: true },
  { id: 'pensioner', label: bi('Pensioner', 'ஓய்வூதியம் பெறுபவர்'), number: '1800-233-5544', visible: true },
  { id: 'login-support', label: bi('For any login issues in Website/Mobile app please call', 'இணையதளம்/மொபைல் பயன்பாட்டில் ஏதேனும் உள்நுழைவுச் சிக்கல்களுக்கு அழைக்கவும்'), number: '044 40115088', visible: true },
];
const AVAILABILITY = '24/7';

/**
 * The Client header spells the Tamil scheme name with "ுத்" (it was hard-coded in SiteHeader.tsx) while the settings
 * name above, used by the hero, does not. Both are reproduced exactly.
 */
const HEADER_SUBTITLE = bi('Tamil Nadu New Health Insurance Scheme', 'தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம்');

/** Destinations of the existing NHIS portals (nhis-client/src/config/portals.ts, default base https://tn-nhis.com). */
const PORTAL_BASE = 'https://tn-nhis.com';
const PORTAL = {
  employee: `${PORTAL_BASE}/?Pagename=TNportal`,
  pensioner: `${PORTAL_BASE}/?Pagename=Pensioners`,
  administrator: `${PORTAL_BASE}/?Pagename=Administrator`,
  insurer: `${PORTAL_BASE}/?Pagename=TNportal`,
  trackClaim: `${PORTAL_BASE}/?Pagename=TNportal`,
  forgotPassword: `${PORTAL_BASE}/Account/ForgetPassword`,
  site: `${PORTAL_BASE}/`,
};

function buildHeader(): SiteContentMap['header'] {
  return {
    emblem: image('assets/tn-government-emblem.png', 794, 862, M.site.emblemAlt),
    portrait: image('assets/header-portrait.jpg', 960, 1200, M.site.portraitAlt),
    showPortrait: true,
    title: bi('TN-NHIS', 'TN-NHIS'),
    subtitle: HEADER_SUBTITLE,
    helplineHeading: M.support.helpline,
    helplines: HELPLINES,
    availability: AVAILABILITY,
    loginMenu: {
      label: M.login.menu,
      heading: M.login.roleHeading,
      // The hospital TPA portals (hospitalMediAssist, hospitalMdIndia) are defined in config/portals.ts but are not in the menu today.
      items: [
        link('employee', M.login.employees, external(PORTAL.employee)),
        link('pensioner', M.login.pensioners, external(PORTAL.pensioner)),
        link('administrator', M.login.administrator, external(PORTAL.administrator)),
        link('insurer', M.login.insurer, external(PORTAL.insurer)),
      ],
      forgotPassword: { ...link('forgotPassword', M.login.forgotPassword, external(PORTAL.forgotPassword)), visible: false },
    },
  };
}

/**
 * User manuals (Google Drive documents). Added on request after the original navigation; the names are neutral on
 * purpose and are renamed by an administrator in Admin > Site content > Navigation. The Tamil texts are a draft that
 * needs review by a Tamil reader. The Drive files must be shared as "Anyone with the link" to open for visitors.
 */
const navLink = (id: string, label: Bilingual, target: LinkTarget): NavLink => ({ type: 'link', ...link(id, label, target) });
const navHeading = (id: string, label: Bilingual): NavHeading => ({ type: 'heading', id, label, visible: true });
const navMenu = (id: string, label: Bilingual, children: NavMenu['children']): NavMenu =>
  ({ type: 'menu', id, label, visible: true, children });

/** Same structure, ids and order as PRIMARY_NAV in nhis-client/src/config/navigation.ts. */
function buildNavigation(): SiteContentMap['navigation'] {
  return {
    items: [
      navLink('home', M.nav.home, route('/')),
      navLink('hospitals', M.nav.hospitals, route('/hospitals')),
      navMenu('scheme', M.nav.scheme, [
        navHeading('policy', M.nav.policyDetails),
        navLink('employee-policy', M.nav.employeePolicy, route('/employee-policy')),
        navLink('pensioner-policy', M.nav.pensionerPolicy, route('/pensioner-policy')),
        navHeading('orders', M.nav.governmentOrders),
        navLink('government-orders', M.nav.governmentOrders, route('/government-orders')),
        navHeading('about', M.nav.scheme),
        navLink('coverage', M.nav.coverage, route('/coverage')),
        navLink('eligibility', M.nav.eligibility, route('/eligibility')),
        navLink('enroll', M.nav.enroll, route('/enrollment')),
        navLink('forms', M.nav.forms, route('/forms')),
      ]),
      navMenu('beneficiary', M.nav.beneficiary, [navLink('track-claim', M.nav.trackClaim, external(PORTAL.trackClaim))]),
      navLink('user-manual', bi('User Manual', 'பயனர் கையேடு'), route('/user-manual')),
      // Hidden by the Client while the Gallery has no published item.
      navLink('gallery', M.nav.gallery, route('/gallery')),
      navLink('grievances', M.nav.grievances, route('/grievances')),
      navLink('contacts', M.nav.contact, route('/contacts')),
    ],
  };
}

/** Pathway of one audience; `formId` is the enrolment annexure form of that audience in the Documents module. */
function pathwayGroup(audience: 'employee' | 'pensioner', formId: string): PathwayGroup {
  const employee = audience === 'employee';
  const row = (suffix: string, icon: SiteIconName, label: Bilingual, target: LinkTarget): PathwayLink =>
    ({ ...link(`${audience}-${suffix}`, label, target), icon });
  return {
    id: audience,
    heading: employee ? M.home.employeePath : M.home.pensionerPath,
    links: [
      row('policy', 'clipboard', employee ? M.home.employeePolicy : M.home.pensionerPolicy, route(employee ? '/employee-policy' : '/pensioner-policy')),
      row('orders', 'scale', M.home.govOrders, route(`/government-orders#${audience}-orders`)),
      row('form', 'file', bi(`${M.home.enrolForm.en}: {title}`, `${M.home.enrolForm.ta}: {title}`), { type: 'document', documentId: formId }),
      row('login', 'login', employee ? M.home.employeeLogin : M.home.pensionerLogin, external(employee ? PORTAL.employee : PORTAL.pensioner)),
    ],
    helplineId: audience,
    visible: true,
  };
}

function buildHome(): SiteContentMap['home'] {
  const tile = (id: string, icon: SiteIconName, label: Bilingual, target: LinkTarget, hint = bi('')): QuickTile =>
    ({ id, icon, label, hint, target, visible: true });
  const categories: DocumentCategory[] = ['enrolment-form', 'policy-non-payable'];
  return {
    // Visual order of the page today; Scheme highlights is new and shows nothing until it has items.
    sections: HOME_SECTION_IDS.map((id) => ({ id, visible: true })),
    hero: {
      eyebrow: M.home.eyebrow,
      title: SCHEME_NAME,
      description: bi(''),
      coverageHeading: M.home.coverageHeading,
      coverageStatement: COVERAGE_STATEMENT,
      actions: [
        { ...link('hero-coverage', M.home.coverageDetails, route('/coverage')), variant: 'secondary' },
        { ...link('hero-forms', M.nav.forms, route('/forms')), variant: 'ghost' },
      ],
      banner: null,
      search: {
        heading: M.home.findHospital,
        hint: M.home.findHospitalHint,
        placeholder: M.home.searchPlaceholder,
        button: M.home.searchButton,
        browseAll: M.home.browseAllHospitals,
        showCount: true,
      },
    },
    quickAccess: {
      heading: M.home.quickHeading,
      tiles: [
        tile('hospitals', 'hospital', M.nav.hospitals, route('/hospitals')),
        tile('coverage', 'shield', M.nav.coverage, route('/coverage')),
        tile('eligibility', 'users', M.nav.eligibility, route('/eligibility')),
        tile('enroll', 'clipboard', M.nav.enroll, route('/enrollment')),
        tile('forms', 'file', M.nav.forms, route('/forms')),
        tile('track', 'search', M.nav.trackClaim, external(PORTAL.trackClaim), M.home.quickTrackHint),
      ],
    },
    pathways: {
      heading: M.home.pathwaysHeading,
      groups: [pathwayGroup('employee', 'form-annexure-vi'), pathwayGroup('pensioner', 'form-annexure-iii')],
    },
    documents: {
      heading: M.home.documentsHeading,
      intro: M.home.documentsIntro,
      documentIds: [],
      categories,
      links: [
        link('all-orders', M.home.allOrders, route('/government-orders')),
        link('all-forms', M.home.allForms, route('/forms')),
      ],
    },
    coverage: { heading: M.pages.coverageTitle, linkLabel: M.home.coverageDetails },
    helplines: { heading: M.home.helplineHeading, intro: M.home.helplineIntro },
    highlights: { heading: bi('Scheme highlights'), intro: bi(''), items: [] },
  };
}

/** Partners in today's order with the shipped logo files; width and height are the pixel size of each file. */
function buildPartners(): SiteContentMap['partners'] {
  const partner = (id: string, categoryId: string, name: string, file: string, width: number, height: number): PartnerEntry => ({
    id, categoryId, name: bi(name), logo: image(`assets/${file}`, width, height, bi(name)), url: null, visible: true,
  });
  return {
    heading: M.home.partnersHeading,
    categories: [
      { id: 'insurance', caption: M.home.insurancePartner, visible: true },
      { id: 'service', caption: M.home.servicePartner, visible: true },
    ],
    partners: [
      partner('united-india', 'insurance', 'United India Insurance', 'united-india-insurance-logo.png', 1012, 763),
      partner('vidal-health', 'service', 'Vidal Health', 'vidal-health-logo.png', 2000, 600),
      partner('medi-assist', 'service', 'Medi Assist', 'medi-assist-logo.png', 1600, 629),
      partner('hitpa', 'service', 'Health Insurance TPA of India Ltd.', 'hitpa-logo.png', 1469, 1071),
    ],
  };
}

/** Same links as FOOTER_LINKS in nhis-client/src/config/navigation.ts (the Client hides Gallery while it is empty). */
const FOOTER_QUICK_LINKS: ReadonlyArray<readonly [id: string, label: Bilingual, path: string]> = [
  ['hospitals', M.nav.hospitals, '/hospitals'],
  ['employee-policy', M.nav.employeePolicy, '/employee-policy'],
  ['pensioner-policy', M.nav.pensionerPolicy, '/pensioner-policy'],
  ['government-orders', M.nav.governmentOrders, '/government-orders'],
  ['coverage', M.nav.coverage, '/coverage'],
  ['eligibility', M.nav.eligibility, '/eligibility'],
  ['enroll', M.nav.enroll, '/enrollment'],
  ['forms', M.nav.forms, '/forms'],
  ['gallery', M.nav.gallery, '/gallery'],
  ['grievances', M.nav.grievances, '/grievances'],
  ['contacts', M.nav.contact, '/contacts'],
];

function buildFooter(): SiteContentMap['footer'] {
  return {
    showWordmark: true,
    logos: [],
    about: { heading: M.footer.about, text: M.footer.aboutText },
    linkGroups: [
      {
        id: 'quick-links',
        heading: M.footer.quickLinks,
        links: FOOTER_QUICK_LINKS.map(([id, label, path]) => link(id, label, route(path))),
        visible: true,
      },
      {
        id: 'portals',
        heading: M.footer.portals,
        links: [
          link('employee', M.login.employees, external(PORTAL.employee)),
          link('pensioner', M.login.pensioners, external(PORTAL.pensioner)),
          link('administrator', M.login.administrator, external(PORTAL.administrator)),
          link('trackClaim', M.nav.trackClaim, external(PORTAL.trackClaim)),
          link('portal-site', M.footer.portalSite, external(PORTAL.site)),
        ],
        visible: true,
      },
    ],
    helplines: { visible: true, heading: M.footer.helplines },
    // Project office details supplied in f0b98e7; the Footer editor owns subsequent changes.
    contact: { visible: true, heading: bi('Project office address', 'திட்ட அலுவலக முகவரி'),
      address: bi('United India Insurance Company Limited (A Govt of India Undertaking)\nDivisional Office: 010600\nNo.134, Silingi Building, Greams Road,\nChennai, Tamil Nadu - 600 006.\nGST Registration No.: 33AAACU5552C1ZQ (Tamil Nadu)'),
      email: '', phone: '044 28297804' },
    copyright: bi(`© {year} ${M.footer.rights.en}`, `© {year} ${M.footer.rights.ta}`),
  };
}

/** A JSON copy: the labels above are shared while the content is built, but every place must own its objects. */
function detached<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The content shown until an administrator publishes a document (see docs/site-content-management.md, section 4). */
export const DEFAULT_SITE_CONTENT: SiteContentMap = detached({
  header: buildHeader(),
  navigation: buildNavigation(),
  home: buildHome(),
  partners: buildPartners(),
  footer: buildFooter(),
  text: { overrides: {} },
  manual: DEFAULT_USER_MANUAL,
});

/** A deep copy of the built-in content of one document, safe to modify. */
export function defaultSiteContent<K extends SiteContentKey>(key: K): SiteContentMap[K] {
  return structuredClone(DEFAULT_SITE_CONTENT[key]);
}
