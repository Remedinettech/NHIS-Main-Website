import type { MessageKey } from './en';

/**
 * Tamil interface labels taken VERBATIM from the scheme website (tn-nhis.com, captured 7 Oct 2026).
 * Do not edit wording here; spelling and quality issues are recorded in docs/CONTENT_REVIEW.md.
 * Newly drafted labels live in ta.proposed.ts and need review.
 */
export const taSource: Partial<Record<MessageKey, string>> = {
  'site.name': 'தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டு திட்டம்',
  'site.shortName': 'TN-NHIS',

  'support.helpline': '24*7 உதவி எண் (கட்டணமில்லா எண்)',

  'nav.home': 'முகப்பு',
  'nav.hospitals': 'அங்கிகரிக்கபட்ட மருத்துவமனைகள்',
  'nav.scheme': 'திட்டம்',
  'nav.policyDetails': 'கொள்கை விவரங்கள்',
  'nav.employeePolicy': 'ஊழியர்',
  'nav.pensionerPolicy': 'ஓய்வூதியதாரர்',
  'nav.governmentOrders': 'அரசு ஆணைகள்',
  'nav.coverage': 'காப்புறு',
  'nav.eligibility': 'தகுதி',
  'nav.enroll': 'பதிவு செய்வது எப்படி',
  'nav.forms': 'படிவங்கள் பதிவிறக்கம்',
  'nav.beneficiary': 'பயனாளி',
  'nav.trackClaim': 'உரிமைகோரலைக் கண்காணிக்கவும்',
  /** The source navigation label is garbled; the Tamil heading of the Gallery page is used instead. */
  'nav.gallery': 'கேலரி',
  'nav.contact': 'தொடர்பு கொள்ளவும்',

  'login.menu': 'உள்நுழைய',
  'login.employees': 'பணியாளர்கள்',
  'login.pensioners': 'ஓய்வூதியம் பெறுவோர்',
  'login.administrator': 'மருத்துவமனை உள்நுழைவு',
  'login.insurer': 'காப்பீட்டாளர்',
  'login.hospitals': 'மருத்துவமனைகள் உள்நுழைவு',
  'login.hospitalMediAssist': 'மெடி அசிஸ்ட் இன்சூரன்ஸ் டிபிஏ பிரைவேட். லிமிடெட்',
  'login.hospitalMdIndia': 'எம்டி இந்தியா ஹெல்த் இன்சூரன்ஸ் டிபிஏ பிரைவேட் லிமிடெட்',

  'common.download': 'பதிவிறக்க',
  'common.viewAll': 'அனைத்தையும் காட்டு',

  'home.insurancePartner': 'காப்பீட்டு நிறுவனம்',
  'home.servicePartner': 'சேவை நிறுவனங்கள்',

  'pages.coverageTitle': 'கவரேஜ்',
  'pages.eligibilityTitle': 'தகுதி',
  'pages.enrollTitle': 'பதிவு செய்வது எப்படி',
  'pages.formsTitle': 'படிவங்கள் பதிவிறக்கம்',

  'contacts.title': 'தொடர்பு கொள்ளவும்',
  'gallery.title': 'கேலரி',
};
