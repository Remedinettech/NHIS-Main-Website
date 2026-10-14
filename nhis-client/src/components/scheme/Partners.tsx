import { useLanguage } from '../../context/LanguageContext';
import './scheme.css';
import { assetUrl } from '../../utils/urls';

interface PartnerLogo {
  name: string;
  file: string;
  /** Intrinsic pixel size of the supplied file, so the browser reserves the correct aspect ratio. */
  width: number;
  height: number;
  shape: 'emblem' | 'wide' | 'banner' | 'stacked';
}

const INSURANCE_PARTNERS: PartnerLogo[] = [
  { name: 'United India Insurance', file: 'united-india-insurance-logo.png', width: 1012, height: 763, shape: 'emblem' },
];

// Order: Vidal Health, Medi Assist, Health Insurance TPA of India Ltd.
const SERVICE_PARTNERS: PartnerLogo[] = [
  { name: 'Vidal Health', file: 'vidal-health-logo.png', width: 2000, height: 600, shape: 'banner' },
  { name: 'Medi Assist', file: 'medi-assist-logo.png', width: 1600, height: 629, shape: 'wide' },
  { name: 'Health Insurance TPA of India Ltd.', file: 'hitpa-logo.png', width: 1469, height: 1071, shape: 'stacked' },
];

/** Partner identities, using the original logo files supplied with the source (scaled by the browser only). */
export function Partners() {
  const { t } = useLanguage();
  const renderLogos = (logos: PartnerLogo[]) =>
    logos.map((logo) => (
      <img
        key={logo.file}
        className={`partner-logo partner-logo--${logo.shape}`}
        src={assetUrl(`assets/${logo.file}`)}
        alt={logo.name}
        width={logo.width}
        height={logo.height}
        loading="lazy"
        decoding="async"
      />
    ));

  return (
    <section className="partners" aria-labelledby="partners-title">
      <h2 id="partners-title">{t('home.partnersHeading')}</h2>
      <div className="partners__grid">
        <figure className="partner-group">
          <figcaption>{t('home.insurancePartner')}</figcaption>
          <div className="partner-group__logos">{renderLogos(INSURANCE_PARTNERS)}</div>
        </figure>
        <figure className="partner-group">
          <figcaption>{t('home.servicePartner')}</figcaption>
          <div className="partner-group__logos">{renderLogos(SERVICE_PARTNERS)}</div>
        </figure>
      </div>
    </section>
  );
}
