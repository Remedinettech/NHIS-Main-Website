import type { EditableTextEntry } from './site-content.types';
import { SITE_CONTENT_LIMITS } from './site-content.constants';

/** Maximum lengths by kind of text: page titles and headings, introductions and notices, short labels, long guidance. */
const TITLE = SITE_CONTENT_LIMITS.heading;
const INTRO = SITE_CONTENT_LIMITS.text;
const LABEL = SITE_CONTENT_LIMITS.label;
const LONG = SITE_CONTENT_LIMITS.longText;

/**
 * Interface texts of the Client that an administrator may override ("Page text" in the Admin), in page order.
 * `key` is a message key of the Client locale files and `defaults` is the text the Client shows today:
 * English from locales/en.ts; Tamil from ta.source.ts, else ta.proposed.ts, else '' (English is then shown).
 *
 * Not listed on purpose: texts that the other site-content documents already manage (nav.*, login.*, support.*,
 * footer.*, home.*, site.*) and purely technical or assistive-technology strings (skip link, menu toggles, aria
 * templates, pagination, loading and error messages, hospital card labels, directory column headings).
 * No listed text contains a {placeholder}.
 * Keep in step with nhis-client/src/config/siteContentDefaults.test.ts, which compares every entry with the locale files.
 */
export const EDITABLE_TEXT_CATALOG: readonly EditableTextEntry[] = [
  // Hospitals
  {
    key: 'hospitals.title', group: 'Hospitals', label: 'Page title', multiline: false, maxLength: TITLE,
    defaults: {"en":"Network hospitals","ta":"அங்கீகரிக்கப்பட்ட மருத்துவமனைகள் பட்டியல்"},
  },
  {
    key: 'hospitals.intro', group: 'Hospitals', label: 'Introduction', multiline: true, maxLength: INTRO,
    defaults: {"en":"Search the network hospital list. Names and addresses are shown in English and Tamil.","ta":"அங்கீகரிக்கப்பட்ட மருத்துவமனைப் பட்டியலில் தேடுக. பெயர்களும் முகவரிகளும் ஆங்கிலத்திலும் தமிழிலும் காட்டப்படுகின்றன."},
  },
  {
    key: 'hospitals.searchLabel', group: 'Hospitals', label: 'Search box label', multiline: false, maxLength: LABEL,
    defaults: {"en":"Search hospitals","ta":"மருத்துவமனைகளைத் தேடுக"},
  },
  {
    key: 'hospitals.searchPlaceholder', group: 'Hospitals', label: 'Search box placeholder', multiline: false, maxLength: LABEL,
    defaults: {"en":"Name, address, district, PIN code or specialty","ta":"பெயர், முகவரி, மாவட்டம், அஞ்சல் குறியீடு அல்லது சிறப்புப் பிரிவு"},
  },
  {
    key: 'hospitals.searchHelp', group: 'Hospitals', label: 'Search box help text', multiline: false, maxLength: LABEL,
    defaults: {"en":"Type or paste English or Tamil text.","ta":"ஆங்கிலம் அல்லது தமிழ் உரையைத் தட்டச்சு செய்யவும் அல்லது ஒட்டவும்."},
  },
  {
    key: 'hospitals.districtLabel', group: 'Hospitals', label: 'District filter label', multiline: false, maxLength: LABEL,
    defaults: {"en":"District","ta":"மாவட்டம்"},
  },
  {
    key: 'hospitals.allDistricts', group: 'Hospitals', label: 'District filter: all districts', multiline: false, maxLength: LABEL,
    defaults: {"en":"All districts","ta":"அனைத்து மாவட்டங்கள்"},
  },

  // Contact
  {
    key: 'contacts.title', group: 'Contact', label: 'Page title', multiline: false, maxLength: TITLE,
    defaults: {"en":"Contact","ta":"தொடர்பு கொள்ளவும்"},
  },
  {
    key: 'contacts.intro', group: 'Contact', label: 'Introduction', multiline: true, maxLength: INTRO,
    defaults: {"en":"Helplines and contact directories for TPA coordinators, UIIC nodal officers, UIIC project office officials, hospitals and treasury offices.","ta":"ஒருங்கிணைப்பாளர்கள், நோடல் அலுவலர்கள், மருத்துவமனைகள் மற்றும் கருவூல அலுவலகங்களுக்கான உதவி எண்களும் தொடர்பு அடைவுகளும்."},
  },
  {
    key: 'contacts.helplines', group: 'Contact', label: 'Helplines heading', multiline: false, maxLength: TITLE,
    defaults: {"en":"Helplines","ta":"உதவி எண்கள்"},
  },
  {
    key: 'contacts.timings', group: 'Contact', label: 'Timings label', multiline: false, maxLength: LABEL,
    defaults: {"en":"Timings","ta":"நேரம்"},
  },
  {
    key: 'contacts.searchLabel', group: 'Contact', label: 'Directory search box label', multiline: false, maxLength: LABEL,
    defaults: {"en":"Search this directory","ta":"இந்த அடைவில் தேடுக"},
  },
  {
    key: 'contacts.searchPlaceholder', group: 'Contact', label: 'Directory search box placeholder', multiline: false, maxLength: LABEL,
    defaults: {"en":"Name, district, office or number","ta":"பெயர், மாவட்டம், அலுவலகம் அல்லது எண்"},
  },
  {
    key: 'contacts.directories.coordinators', group: 'Contact', label: 'Directory tab: coordinators', multiline: false, maxLength: LABEL,
    defaults: {"en":"TPA coordinators","ta":"TPA ஒருங்கிணைப்பாளர்கள்"},
  },
  {
    key: 'contacts.directories.uiic-nodal-officers', group: 'Contact', label: 'Directory tab: nodal officers', multiline: false, maxLength: LABEL,
    defaults: {"en":"UIIC Nodal Officers","ta":"UIIC நோடல் அலுவலர்கள்"},
  },
  {
    key: 'contacts.directories.hospital-nodal-officers', group: 'Contact', label: 'Directory tab: hospital nodal officers', multiline: false, maxLength: LABEL,
    defaults: {"en":"Hospital nodal officers","ta":"மருத்துவமனை நோடல் அலுவலர்கள்"},
  },
  {
    key: 'contacts.directories.treasury-offices', group: 'Contact', label: 'Directory tab: district treasury offices', multiline: false, maxLength: LABEL,
    defaults: {"en":"District Treasury Office Mail & Phone Number","ta":"மாவட்டக் கருவூல அலுவலக மின்னஞ்சல் மற்றும் தொலைபேசி எண்"},
  },
  {
    key: 'contacts.cols.serial', group: 'Contact', label: 'Column heading: No.', multiline: false, maxLength: LABEL,
    defaults: {"en":"No.","ta":"எண்"},
  },
  {
    key: 'contacts.cols.district', group: 'Contact', label: 'Column heading: District', multiline: false, maxLength: LABEL,
    defaults: {"en":"District","ta":"மாவட்டம்"},
  },
  {
    key: 'contacts.cols.coordinator', group: 'Contact', label: 'Column heading: Coordinator', multiline: false, maxLength: LABEL,
    defaults: {"en":"TPA coordinator","ta":"TPA ஒருங்கிணைப்பாளர்"},
  },
  {
    key: 'contacts.cols.nodalOfficer', group: 'Contact', label: 'Column heading: Nodal officer', multiline: false, maxLength: LABEL,
    defaults: {"en":"Nodal officer","ta":"நோடல் அலுவலர்"},
  },
  {
    key: 'contacts.cols.designation', group: 'Contact', label: 'Column heading: Designation', multiline: false, maxLength: LABEL,
    defaults: {"en":"Designation","ta":"பதவி"},
  },
  {
    key: 'contacts.cols.hospital', group: 'Contact', label: 'Column heading: Hospital', multiline: false, maxLength: LABEL,
    defaults: {"en":"Hospital","ta":"மருத்துவமனை"},
  },
  {
    key: 'contacts.cols.office', group: 'Contact', label: 'Column heading: Office', multiline: false, maxLength: LABEL,
    defaults: {"en":"Office","ta":"அலுவலகம்"},
  },
  {
    key: 'contacts.cols.email', group: 'Contact', label: 'Column heading: E-mail', multiline: false, maxLength: LABEL,
    defaults: {"en":"E-mail","ta":"மின்னஞ்சல்"},
  },
  {
    key: 'contacts.cols.phone', group: 'Contact', label: 'Column heading: Contact number', multiline: false, maxLength: LABEL,
    defaults: {"en":"Contact number","ta":"தொடர்பு எண்"},
  },

  { key: 'contacts.directories.project-office-officials', group: 'Contact', label: 'Directory tab: UIIC Project Office Officials', multiline: false, maxLength: LABEL, defaults: {"en":"UIIC Project Office Officials","ta":"UIIC திட்ட அலுவலக அலுவலர்கள்"}, },
  { key: 'contacts.cols.empNo', group: 'Contact', label: 'Column heading: Employee number', multiline: false, maxLength: LABEL, defaults: {"en":"Emp. No.","ta":"பணியாளர் எண்"}, },

  // Government orders
  {
    key: 'documents.ordersTitle', group: 'Government orders', label: 'Page title', multiline: false, maxLength: TITLE,
    defaults: {"en":"Government orders","ta":"அரசாணைகள்"},
  },
  {
    key: 'documents.ordersIntro', group: 'Government orders', label: 'Introduction', multiline: true, maxLength: INTRO,
    defaults: {"en":"Government orders for employees and pensioners, in the order listed on the scheme website.","ta":"ஊழியர்கள் மற்றும் ஓய்வூதியதாரர்களுக்கான அரசாணைகள், திட்ட இணையதளத்தில் பட்டியலிடப்பட்ட வரிசையில்."},
  },
  {
    key: 'documents.searchLabel', group: 'Government orders', label: 'Search box label', multiline: false, maxLength: LABEL,
    defaults: {"en":"Search government orders","ta":"அரசாணைகளைத் தேடுக"},
  },
  {
    key: 'documents.searchPlaceholder', group: 'Government orders', label: 'Search box placeholder', multiline: false, maxLength: LABEL,
    defaults: {"en":"Order number, year or title","ta":"ஆணை எண், ஆண்டு அல்லது தலைப்பு"},
  },
  {
    key: 'documents.employeeGroup', group: 'Government orders', label: 'Employee orders heading', multiline: false, maxLength: TITLE,
    defaults: {"en":"Employee orders","ta":"ஊழியர் ஆணைகள்"},
  },
  {
    key: 'documents.pensionerGroup', group: 'Government orders', label: 'Pensioner orders heading', multiline: false, maxLength: TITLE,
    defaults: {"en":"Pensioner orders","ta":"ஓய்வூதியதாரர் ஆணைகள்"},
  },

  // Forms and downloads
  {
    key: 'pages.formsTitle', group: 'Forms and downloads', label: 'Page title', multiline: false, maxLength: TITLE,
    defaults: {"en":"Forms and downloads","ta":"படிவங்கள் பதிவிறக்கம்"},
  },
  {
    key: 'documents.formsHeading', group: 'Forms and downloads', label: 'Enrolment forms heading', multiline: false, maxLength: TITLE,
    defaults: {"en":"Enrolment forms","ta":"பதிவுப் படிவங்கள்"},
  },
  {
    key: 'documents.guidesHeading', group: 'Forms and downloads', label: 'Enrolment guides heading', multiline: false, maxLength: TITLE,
    defaults: {"en":"Enrolment guides","ta":"பதிவு வழிகாட்டிகள்"},
  },
  {
    key: 'documents.policyHeading', group: 'Forms and downloads', label: 'Policy lists heading', multiline: false, maxLength: TITLE,
    defaults: {"en":"Policy lists","ta":"கொள்கைப் பட்டியல்கள்"},
  },

  // Coverage, eligibility and enrolment
  {
    key: 'pages.coverageTitle', group: 'Coverage, eligibility and enrolment', label: 'Coverage: page title (also the heading of the homepage coverage panel)', multiline: false, maxLength: TITLE,
    defaults: {"en":"Coverage","ta":"கவரேஜ்"},
  },
  {
    key: 'pages.eligibilityTitle', group: 'Coverage, eligibility and enrolment', label: 'Eligibility: page title', multiline: false, maxLength: TITLE,
    defaults: {"en":"Eligibility","ta":"தகுதி"},
  },
  {
    key: 'pages.enrollTitle', group: 'Coverage, eligibility and enrolment', label: 'How to enroll: page title', multiline: false, maxLength: TITLE,
    defaults: {"en":"How to enroll","ta":"பதிவு செய்வது எப்படி"},
  },

  // Grievances
  {
    key: 'pages.grievancesTitle', group: 'Grievances', label: 'Page title', multiline: false, maxLength: TITLE,
    defaults: {"en":"Grievances","ta":"குறைதீர்ப்பு"},
  },
  {
    key: 'grievances.guidance', group: 'Grievances', label: 'Guidance note', multiline: true, maxLength: LONG,
    defaults: {"en":"To raise a grievance, send an e-mail to the addresses shown below for your TPA and attach a copy of your NHIS ID card.","ta":"குறையைத் தெரிவிக்க, உங்கள் TPA-க்கான கீழே உள்ள மின்னஞ்சல் முகவரிகளுக்கு மின்னஞ்சல் அனுப்பி, உங்கள் NHIS அடையாள அட்டையின் நகலை இணைக்கவும்."},
  },

  // Gallery
  {
    key: 'gallery.title', group: 'Gallery', label: 'Page title', multiline: false, maxLength: TITLE,
    defaults: {"en":"Gallery","ta":"கேலரி"},
  },

  // Content pages
  {
    key: 'pages.relatedLinks', group: 'Content pages', label: 'Heading of the list of related pages', multiline: false, maxLength: TITLE,
    defaults: {"en":"Related pages","ta":"தொடர்புடைய பக்கங்கள்"},
  },

  // Notices
  {
    key: 'fallback.tamilMissing', group: 'Notices', label: 'Notice when a page has no Tamil version', multiline: false, maxLength: INTRO,
    defaults: {"en":"This page is currently available in English only.","ta":"இந்தப் பக்கம் தற்போது ஆங்கிலத்தில் மட்டுமே கிடைக்கிறது."},
  },
  {
    key: 'fallback.englishMissing', group: 'Notices', label: 'Notice when a page has no English version', multiline: false, maxLength: INTRO,
    defaults: {"en":"This page is currently available in Tamil only.","ta":"இந்தப் பக்கம் தற்போது தமிழில் மட்டுமே கிடைக்கிறது."},
  },
  {
    key: 'announcements.region', group: 'Notices', label: 'Name of the announcements area', multiline: false, maxLength: LABEL,
    defaults: {"en":"Notices","ta":"அறிவிப்புகள்"},
  },



  // Page not found
  {
    key: 'common.notFoundTitle', group: 'Page not found', label: 'Page title', multiline: false, maxLength: TITLE,
    defaults: {"en":"Page not found","ta":"பக்கம் கிடைக்கவில்லை"},
  },
  {
    key: 'common.notFoundBody', group: 'Page not found', label: 'Message', multiline: true, maxLength: INTRO,
    defaults: {"en":"The page you asked for does not exist on this site.","ta":"நீங்கள் கேட்ட பக்கம் இந்தத் தளத்தில் இல்லை."},
  },
  {
    key: 'common.goHome', group: 'Page not found', label: 'Button: back to the home page', multiline: false, maxLength: LABEL,
    defaults: {"en":"Go to the home page","ta":"முகப்புப் பக்கத்திற்குச் செல்லவும்"},
  },
];

export function editableTextEntry(key: string): EditableTextEntry | undefined {
  return EDITABLE_TEXT_CATALOG.find((entry) => entry.key === key);
}
