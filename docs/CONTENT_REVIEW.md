# Content review log

Source: https://tn-nhis.com/ captured 7 October 2026 (`reference/nhis-handoff`). Nothing below has been silently decided: the captured text is the baseline, and every difference or proposed change is listed for the content owner. These notes are kept here and in the API data (`reviewNotes` on each page, directory `flags`); they are deliberately not shown on the public site or the admin screens.

## Live-site comparison (12 October 2026)

Fetched https://tn-nhis.com/ and /Account/Employeesscheme. Matches the capture on: employee policy period (01-07-2021 to 30-06-2025), the age-25 child condition in English, helplines (1800-233-5666, 1800-233-5544, 044 40115088), the suspension notice and its two different PDF targets, and all 15 government-order labels/links. No difference found. Other pages were not re-fetched; the capture remains the baseline for them.

## Policy and wording (needs owner decision)

| # | Item | Status |
|---|---|---|
| 1 | Employee policy period 01-07-2021 to 30-06-2025 and pensioner period 01-07-2022 to 30-06-2026 are both before the capture date | Shown as published; no renewal period inferred. Approved current wording required before launch |
| 2 | Employee eligibility: English says children covered until employed/married/age 25; Tamil says no upper age limit | Material conflict, both preserved, not reconciled |
| 3 | Employee English vs Tamil section structure differs (extra Coverage section, 4 vs 3 eligibility points, Annexure-I vs அட்டவணை 1A) | Kept as independent section lists |
| 4 | Pensioner English begins "AAll the Pensioners"; Tamil About text split mid-sentence | Preserved |
| 5 | Eligibility page Tamil pensioner sentence is incomplete | Preserved |
| 6 | Grievances Tamil body is garbled; Tamil heading and nav label `காப்புறு` duplicates Coverage | Preserved; the Tamil UI nav label for Grievances is a proposed draft (below) |
| 7 | Gallery Tamil nav label is garbled; Tamil nav links for Gallery/Grievances were `#` | Tamil UI nav uses the Tamil page heading `கேலரி`; links fixed to real routes (functional correction) |
| 8 | How to Enroll, contact directories and login pages have no Tamil in the source | English shown with an explicit notice; nothing translated |
| 9 | Hospital nav label `அங்கிகரிக்கபட்ட மருத்துவமனைகள்` (source spelling) | Used as published for the nav; the page title is a proposed draft |
| 10 | Single mid-word tab "th<TAB>e" in employee English | Normalised to "th e"; flagged |

## Presentation decisions (interface vs data)

- Interface copy no longer mentions snapshots, sources or review. The facts behind that copy are recorded in this file instead.
- Contact directory column headings are display labels chosen from the column contents (the hospital nodal officer workbook has its first two header cells in the wrong order; the live website displays that directory with District / Nodal officer, so the heading follows the values).
- Hospital map links are shown without a "not verified" label; some source coordinates do not match the city (see Links and contacts #6). Request a corrected dataset before relying on them for navigation.
- The Gallery link and page are hidden until the API returns at least one item; `/gallery` redirects home while empty.
- Document rows no longer show hashes, file-name dates or original URLs; this data stays in the API (`/api/v1/documents`).

## Documents

| # | Item | Status |
|---|---|---|
| 1 | Pensioner G.O.(Rt).No.199 PDF returned 404 | Listed, marked "Unavailable at capture", no file. The employee 199 file is NOT substituted |
| 2 | Two suspension PDFs (`suspendedHospitalnew.pdf` English link, `suspended Hospital.pdf` Tamil link) differ in bytes and text | Both kept as distinct versions; neither declared authoritative |
| 3 | Label date vs file-name date differ: G.O.Ms.No.71 (21 Mar 2022 vs 15-07-2022), 160 (29 Jun 2021 vs 15-07-2021; policy page cites 30.06.2021), 202 (30 Jun 2016 vs 19-07-2016) | Source label shown; file-name date noted. Filenames are not authoritative |
| 4 | Employee and pensioner G.O.Ms.No.241 are byte-identical | Both entries kept |
| 5 | Forms page "Download" links point to `Download3` (HTTP 500) | Functional correction: Annexure VI/III link to the annexure PDFs on the How to Enroll page |
| 6 | Four PDFs are scans without text layer | Originals kept unchanged; no transcripts made |
| 7 | Source URLs with `//` (pensioner 241, 79) | Local copies stored under normalised paths; original URLs retained in the registry |

## Links and contacts

| # | Item | Status |
|---|---|---|
| 1 | Grievance e-mail links lacked `mailto:` (404) | Displayed addresses unchanged; UI builds `mailto:` links (functional correction). 3 distinct addresses, 8 occurrences |
| 2 | `/index.html`, `/Account/index.html`, `/Home/index.html` 404; `/submitecashless.aspx`, `/Home/Download3` 500; `/account/login` returns home content | Not reproduced; `submitecashless.aspx` educational link is not used. Verify `/account/login` intent with backend owner |
| 3 | "Hospitals login" has no destination (`#`) in the source | Offered as the two TPA hospital portals found on the source (`provider.ihx.in`, `tnnhis2016.com`); confirm |
| 4 | Hospital-nodal workbook headers are swapped relative to values (A "NODAL OFFICER" holds districts) | Source columns and headers kept, visible warning shown; owner to confirm correction |
| 5 | Two hospital-nodal cells had trailing spaces; duplicate numbers/hospital names, phone formats and district spellings vary across directories | Informational flags in the API/admin |
| 6 | Hospital map URLs: some coordinates do not match the displayed city (e.g. Bengaluru entries near longitude 80) | Not recomputed; map links labelled "location not verified". Corrected dataset requested |
| 7 | Hospital phone/specialty text has line breaks and merged numbers | Shown with source line breaks; no tel: links generated for hospitals |
| 8 | Gallery page HTML contains two `<video>` elements (2023-10-31 MP4s) not in the package | Not listed; confirm with data owner whether they are intended content |
| 9 | Hospital whitespace (double spaces) | Display collapses whitespace; search normalises it; stored data unchanged |

## Proposed Tamil interface labels (draft, need review)

Labels not found on the source site were drafted so the Tamil UI is complete. They live in `nhis-client/src/locales/ta.proposed.ts`; source-derived labels are in `ta.source.ts` and must not be edited. `npm test -w nhis-client` fails if a key has no Tamil at all. Review all of these before launch:

| Key | English | Proposed Tamil |
|---|---|---|
| `site.skipToContent` | Skip to main content | முதன்மை உள்ளடக்கத்திற்குச் செல்லவும் |
| `site.emblemAlt` | Tamil Nadu government emblem | தமிழ்நாடு அரசு சின்னம் |
| `site.portraitAlt` | Portrait displayed in the site header | தளத்தின் தலைப்புப் பகுதியில் காட்டப்படும் உருவப்படம் |
| `site.homeLink` | TN-NHIS home | TN-NHIS முகப்பு |
| `site.mainNav` | Main navigation | முதன்மை வழிசெலுத்தல் |
| `lang.select` | Select Language | மொழியைத் தேர்ந்தெடுக்கவும் |
| `support.region` | Helpline information | உதவி எண் தகவல் |
| `support.availability` | Available {hours} | {hours} கிடைக்கும் |
| `support.unavailable` | Helpline details could not be loaded. | உதவி எண் விவரங்களை ஏற்ற இயலவில்லை. |
| `support.callAria` | Call {label} on {number} | {number} என்ற எண்ணில் {label} ஐ அழைக்கவும் |
| `nav.grievances` | Grievances | குறைதீர்ப்பு |
| `nav.openMenu` | Open menu | பட்டியைத் திற |
| `nav.closeMenu` | Close menu | பட்டியை மூடு |
| `nav.external` | Opens the NHIS portal in a new tab | NHIS தளத்தைப் புதிய தாவலில் திறக்கும் |
| `login.forgotPassword` | Forgot Password? | கடவுச்சொல்லை மறந்துவிட்டீர்களா? |
| `login.roleHeading` | Sign in as | இவ்வாறு உள்நுழைக |
| `common.loading` | Loading… | ஏற்றப்படுகிறது… |
| `common.retry` | Try again | மீண்டும் முயற்சிக்கவும் |
| `common.clear` | Clear | அழி |
| `common.clearFilters` | Clear search and filters | தேடல் மற்றும் வடிப்பான்களை அழி |
| `common.pdf` | PDF | PDF |
| `common.opensInNewTab` | opens in a new tab | புதிய தாவலில் திறக்கும் |
| `common.previous` | Previous | முந்தையது |
| `common.next` | Next | அடுத்தது |
| `common.pageOf` | Page {page} of {total} | பக்கம் {page} / {total} |
| `common.pagination` | Pagination | பக்க எண்கள் |
| `common.showingRange` | Showing {from}–{to} of {total} | {total} இல் {from}–{to} காட்டப்படுகிறது |
| `common.onThisPage` | On this page | இந்தப் பக்கத்தில் |
| `common.errorTitle` | Something went wrong | ஏதோ தவறு நேர்ந்தது |
| `common.notFoundTitle` | Page not found | பக்கம் கிடைக்கவில்லை |
| `common.notFoundBody` | The page you asked for does not exist on this site. | நீங்கள் கேட்ட பக்கம் இந்தத் தளத்தில் இல்லை. |
| `common.goHome` | Go to the home page | முகப்புப் பக்கத்திற்குச் செல்லவும் |
| `common.networkError` | The information service could not be reached. Check your connection and try again. | தகவல் சேவையை அடைய இயலவில்லை. இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும். |
| `common.serverError` | The information service returned an error ({status}). Please try again later. | தகவல் சேவை பிழையைத் தந்தது ({status}). பின்னர் மீண்டும் முயற்சிக்கவும். |
| `common.unexpectedError` | The information could not be loaded. | தகவலை ஏற்ற இயலவில்லை. |
| `fallback.tamilMissing` | This page is currently available in English only. | இந்தப் பக்கம் தற்போது ஆங்கிலத்தில் மட்டுமே கிடைக்கிறது. |
| `fallback.englishMissing` | This page is currently available in Tamil only. | இந்தப் பக்கம் தற்போது தமிழில் மட்டுமே கிடைக்கிறது. |
| `announcements.region` | Notices | அறிவிப்புகள் |
| `announcements.alsoIn` | Notice also available in: | இந்த அறிவிப்பு இவற்றிலும் கிடைக்கும்: |
| `home.eyebrow` | Health insurance for government employees and pensioners | அரசு ஊழியர்கள் மற்றும் ஓய்வூதியதாரர்களுக்கான மருத்துவக் காப்பீடு |
| `home.coverageHeading` | Coverage | காப்பீடு |
| `home.coverageDetails` | Read coverage details | காப்பீட்டு விவரங்களைப் படிக்க |
| `home.findHospital` | Find a network hospital | அங்கீகரிக்கப்பட்ட மருத்துவமனையைக் கண்டறிக |
| `home.findHospitalHint` | Search by hospital name, address, district or specialty in English or Tamil. | மருத்துவமனை பெயர், முகவரி, மாவட்டம் அல்லது சிறப்புப் பிரிவு மூலம் ஆங்கிலம் அல்லது தமிழில் தேடலாம். |
| `home.searchPlaceholder` | Hospital name, address or specialty | மருத்துவமனை பெயர், முகவரி அல்லது சிறப்புப் பிரிவு |
| `home.searchButton` | Search hospitals | மருத்துவமனைகளைத் தேடு |
| `home.hospitalCount` | Search across {count} listed hospitals. | பட்டியலிடப்பட்ட {count} மருத்துவமனைகளில் தேடலாம். |
| `home.browseAllHospitals` | Browse all network hospitals | அனைத்து மருத்துவமனைகளையும் காண்க |
| `home.pathwaysHeading` | Choose your pathway | உங்கள் வழியைத் தேர்ந்தெடுக்கவும் |
| `home.employeePath` | For employees | ஊழியர்களுக்கு |
| `home.pensionerPath` | For pensioners | ஓய்வூதியதாரர்களுக்கு |
| `home.employeePolicy` | Employee policy details | ஊழியர் கொள்கை விவரங்கள் |
| `home.pensionerPolicy` | Pensioner policy details | ஓய்வூதியதாரர் கொள்கை விவரங்கள் |
| `home.govOrders` | Government orders | அரசாணைகள் |
| `home.enrolForm` | Enrolment annexure form | பதிவுப் படிவ இணைப்பு |
| `home.employeeLogin` | Employee portal | ஊழியர் தளம் |
| `home.pensionerLogin` | Pensioner portal | ஓய்வூதியதாரர் தளம் |
| `home.quickHeading` | Quick access | விரைவு அணுகல் |
| `home.quickTrackHint` | NHIS portal | NHIS தளம் |
| `home.internalHint` | On this site | இந்தத் தளத்தில் |
| `home.documentsHeading` | Documents and forms | ஆவணங்களும் படிவங்களும் |
| `home.documentsIntro` | Enrolment forms and policy lists for download. | பதிவுப் படிவங்களும் கொள்கைப் பட்டியல்களும் பதிவிறக்கத்திற்கு. |
| `home.allOrders` | View all government orders | அனைத்து அரசாணைகளையும் காண்க |
| `home.allForms` | All forms and downloads | அனைத்து படிவங்கள் மற்றும் பதிவிறக்கங்கள் |
| `home.partnersHeading` | Our partners | எங்கள் கூட்டாளிகள் |
| `home.helplineHeading` | Help and support | உதவி மற்றும் ஆதரவு |
| `home.helplineIntro` | Toll-free helplines for employees and pensioners. | ஊழியர்கள் மற்றும் ஓய்வூதியதாரர்களுக்கான கட்டணமில்லா உதவி எண்கள். |
| `hospitals.title` | Network hospitals | அங்கீகரிக்கப்பட்ட மருத்துவமனைகள் பட்டியல் |
| `hospitals.intro` | Search the network hospital list. Names and addresses are shown in English and Tamil. | அங்கீகரிக்கப்பட்ட மருத்துவமனைப் பட்டியலில் தேடுக. பெயர்களும் முகவரிகளும் ஆங்கிலத்திலும் தமிழிலும் காட்டப்படுகின்றன. |
| `hospitals.searchLabel` | Search hospitals | மருத்துவமனைகளைத் தேடுக |
| `hospitals.searchPlaceholder` | Name, address, district, PIN code or specialty | பெயர், முகவரி, மாவட்டம், அஞ்சல் குறியீடு அல்லது சிறப்புப் பிரிவு |
| `hospitals.searchHelp` | Type or paste English or Tamil text. | ஆங்கிலம் அல்லது தமிழ் உரையைத் தட்டச்சு செய்யவும் அல்லது ஒட்டவும். |
| `hospitals.districtLabel` | District | மாவட்டம் |
| `hospitals.allDistricts` | All districts | அனைத்து மாவட்டங்கள் |
| `hospitals.resultCount` | {count} hospitals found | {count} மருத்துவமனைகள் கண்டறியப்பட்டன |
| `hospitals.resultCountOne` | 1 hospital found | 1 மருத்துவமனை கண்டறியப்பட்டது |
| `hospitals.resultsRegion` | Hospital results | மருத்துவமனை முடிவுகள் |
| `hospitals.loadingResults` | Loading hospitals… | மருத்துவமனைகள் ஏற்றப்படுகின்றன… |
| `hospitals.errorTitle` | The hospital list could not be loaded | மருத்துவமனைப் பட்டியலை ஏற்ற இயலவில்லை |
| `hospitals.emptyTitle` | No hospitals match your search | உங்கள் தேடலுக்குப் பொருந்தும் மருத்துவமனைகள் இல்லை |
| `hospitals.emptyBody` | Check the spelling, try fewer words, or clear the district filter. | எழுத்துப்பிழையைச் சரிபார்க்கவும், குறைவான சொற்களைப் பயன்படுத்தவும், அல்லது மாவட்ட வடிப்பானை அழிக்கவும். |
| `hospitals.contact` | Contact | தொடர்பு |
| `hospitals.specialties` | Specialties | சிறப்புப் பிரிவுகள் |
| `hospitals.address` | Address | முகவரி |
| `hospitals.pin` | PIN | அஞ்சல் குறியீடு |
| `hospitals.viewMap` | View on map | வரைபடத்தில் காண்க |
| `hospitals.noMap` | No map link available | வரைபட இணைப்பு இல்லை |
| `hospitals.noContact` | No contact number listed | தொடர்பு எண் குறிப்பிடப்படவில்லை |
| `hospitals.noSpecialty` | No specialty listed | சிறப்புப் பிரிவு குறிப்பிடப்படவில்லை |
| `hospitals.refreshing` | Updating results… | முடிவுகள் புதுப்பிக்கப்படுகின்றன… |
| `pages.grievancesTitle` | Grievances | குறைதீர்ப்பு |
| `pages.loadError` | This page could not be loaded | இந்தப் பக்கத்தை ஏற்ற இயலவில்லை |
| `pages.relatedLinks` | Related pages | தொடர்புடைய பக்கங்கள் |
| `documents.ordersTitle` | Government orders | அரசாணைகள் |
| `documents.ordersIntro` | Government orders for employees and pensioners, in the order listed on the scheme website. | ஊழியர்கள் மற்றும் ஓய்வூதியதாரர்களுக்கான அரசாணைகள், திட்ட இணையதளத்தில் பட்டியலிடப்பட்ட வரிசையில். |
| `documents.searchLabel` | Search government orders | அரசாணைகளைத் தேடுக |
| `documents.searchPlaceholder` | Order number, year or title | ஆணை எண், ஆண்டு அல்லது தலைப்பு |
| `documents.employeeGroup` | Employee orders | ஊழியர் ஆணைகள் |
| `documents.pensionerGroup` | Pensioner orders | ஓய்வூதியதாரர் ஆணைகள் |
| `documents.groupCount` | {count} listed | {count} பட்டியலிடப்பட்டுள்ளன |
| `documents.noMatch` | No government orders match your search. | உங்கள் தேடலுக்குப் பொருந்தும் அரசாணைகள் இல்லை. |
| `documents.loadError` | Documents could not be loaded | ஆவணங்களை ஏற்ற இயலவில்லை |
| `documents.date` | Date | தேதி |
| `documents.pagesCount` | {count} pages | {count} பக்கங்கள் |
| `documents.downloadAria` | Download {title} (PDF) | {title} (PDF) பதிவிறக்கு |
| `documents.unavailableBadge` | Unavailable | கிடைக்கவில்லை |
| `documents.unavailableNote` | This document is currently unavailable for download. | இந்த ஆவணம் தற்போது பதிவிறக்கத்திற்குக் கிடைக்கவில்லை. |
| `documents.unavailableAction` | Not available | கிடைக்கவில்லை |
| `documents.langEn` | English | ஆங்கிலம் |
| `documents.langTa` | Tamil | தமிழ் |
| `documents.categories.govt-order-employee` | Government order (employee) | அரசாணை (ஊழியர்) |
| `documents.categories.govt-order-pensioner` | Government order (pensioner) | அரசாணை (ஓய்வூதியதாரர்) |
| `documents.categories.policy-non-payable` | Non-payable medical expenses list | செலுத்த முடியாத மருத்துவ செலவுகள் பட்டியல் |
| `documents.categories.enrolment-guide` | Enrolment guide | பதிவு வழிகாட்டி |
| `documents.categories.enrolment-form` | Enrolment form | பதிவுப் படிவம் |
| `documents.categories.hospital-suspension` | Hospital notice | மருத்துவமனை அறிவிப்பு |
| `documents.formsHeading` | Enrolment forms | பதிவுப் படிவங்கள் |
| `documents.guidesHeading` | Enrolment guides | பதிவு வழிகாட்டிகள் |
| `documents.policyHeading` | Policy lists | கொள்கைப் பட்டியல்கள் |
| `contacts.intro` | Helplines and contact directories for coordinators, nodal officers, hospitals and treasury offices. | ஒருங்கிணைப்பாளர்கள், நோடல் அலுவலர்கள், மருத்துவமனைகள் மற்றும் கருவூல அலுவலகங்களுக்கான உதவி எண்களும் தொடர்பு அடைவுகளும். |
| `contacts.helplines` | Helplines | உதவி எண்கள் |
| `contacts.timings` | Timings | நேரம் |
| `contacts.tablistLabel` | Contact directories | தொடர்பு அடைவுகள் |
| `contacts.searchLabel` | Search this directory | இந்த அடைவில் தேடுக |
| `contacts.searchPlaceholder` | Name, district, office or number | பெயர், மாவட்டம், அலுவலகம் அல்லது எண் |
| `contacts.rowCount` | {shown} of {total} entries | {total} இல் {shown} பதிவுகள் |
| `contacts.noMatch` | No entries match your search. | உங்கள் தேடலுக்குப் பொருந்தும் பதிவுகள் இல்லை. |
| `contacts.loadError` | The contact directory could not be loaded | தொடர்பு அடைவை ஏற்ற இயலவில்லை |
| `contacts.directories.coordinators` | Coordinators | ஒருங்கிணைப்பாளர்கள் |
| `contacts.directories.uiic-nodal-officers` | Nodal Officers | நோடல் அலுவலர்கள் |
| `contacts.directories.hospital-nodal-officers` | Hospital nodal officers | மருத்துவமனை நோடல் அலுவலர்கள் |
| `contacts.directories.treasury-offices` | District Treasury Office Mail & Phone Number | மாவட்டக் கருவூல அலுவலக மின்னஞ்சல் மற்றும் தொலைபேசி எண் |
| `contacts.cols.serial` | No. | எண் |
| `contacts.cols.district` | District | மாவட்டம் |
| `contacts.cols.coordinator` | Coordinator | ஒருங்கிணைப்பாளர் |
| `contacts.cols.nodalOfficer` | Nodal officer | நோடல் அலுவலர் |
| `contacts.cols.designation` | Designation | பதவி |
| `contacts.cols.hospital` | Hospital | மருத்துவமனை |
| `contacts.cols.office` | Office | அலுவலகம் |
| `contacts.cols.email` | E-mail | மின்னஞ்சல் |
| `contacts.cols.phone` | Contact number | தொடர்பு எண் |
| `grievances.guidance` | To raise a grievance, send an e-mail to the addresses shown below for your TPA and attach a copy of your NHIS ID card. | குறையைத் தெரிவிக்க, உங்கள் TPA-க்கான கீழே உள்ள மின்னஞ்சல் முகவரிகளுக்கு மின்னஞ்சல் அனுப்பி, உங்கள் NHIS அடையாள அட்டையின் நகலை இணைக்கவும். |
| `gallery.loadError` | The gallery could not be loaded | கேலரியை ஏற்ற இயலவில்லை |
| `footer.about` | Tamil Nadu New Health Insurance Scheme | தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம் |
| `footer.aboutText` | Health insurance cover for government employees, pensioners and their eligible family members, implemented through United India Insurance with Vidal Health, Medi Assist and Health Insurance TPA of India (HITPA) as service partners. | அரசு ஊழியர்கள், ஓய்வூதியதாரர்கள் மற்றும் அவர்களின் தகுதியுடைய குடும்ப உறுப்பினர்களுக்கான மருத்துவக் காப்பீடு; யுனைடெட் இந்தியா இன்சூரன்ஸ் மூலம் செயல்படுத்தப்படுகிறது, விடல் ஹெல்த், மெடி அசிஸ்ட் மற்றும் ஹெல்த் இன்சூரன்ஸ் டிபிஏ ஆஃப் இந்தியா (HITPA) ஆகியவை சேவைக் கூட்டாளிகளாக உள்ளன. |
| `footer.quickLinks` | Quick links | விரைவு இணைப்புகள் |
| `footer.portals` | NHIS portals | NHIS தளங்கள் |
| `footer.helplines` | Helplines | உதவி எண்கள் |
| `footer.portalSite` | NHIS portal (tn-nhis.com) | NHIS தளம் (tn-nhis.com) |
| `footer.partnerPortals` | Partner hospital portals | கூட்டாளி மருத்துவமனைத் தளங்கள் |
| `footer.rights` | Tamil Nadu New Health Insurance Scheme | தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம் |
