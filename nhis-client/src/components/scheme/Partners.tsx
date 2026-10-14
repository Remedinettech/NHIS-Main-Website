import { useLanguage } from '../../context/LanguageContext';
import './scheme.css';
import { assetUrl } from '../../utils/urls';

/** Partner identities, using the original logo files supplied with the source (resized by the browser only). */
export function Partners() {
  const { t } = useLanguage();
  return (
    <section className="partners" aria-labelledby="partners-title">
      <h2 id="partners-title">{t('home.partnersHeading')}</h2>
      <div className="partners__grid">
        <figure className="partner-group">
          <figcaption>{t('home.insurancePartner')}</figcaption>
          <div className="partner-group__logos">
            <img src={assetUrl('assets/united-india-insurance-logo.png')} alt="United India Insurance" width="300" height="100" loading="lazy" />
          </div>
        </figure>
        <figure className="partner-group">
          <figcaption>{t('home.servicePartner')}</figcaption>
          <div className="partner-group__logos">
            <img src={assetUrl('assets/medi-assist-logo.png')} alt="Medi Assist" width="300" height="100" loading="lazy" />
            <img src={assetUrl('assets/md-india-logo.png')} alt="MDIndia" width="300" height="100" loading="lazy" />
          </div>
        </figure>
      </div>
    </section>
  );
}
