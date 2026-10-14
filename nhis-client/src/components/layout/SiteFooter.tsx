import { Link } from 'react-router-dom';
import { APP_CONFIG } from '../../config/app';
import { ROUTES } from '../../config/routes';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettings } from '../../context/SiteSettingsContext';
import { usePortalHrefs } from '../../hooks/usePortals';
import { useVisibleFooterLinks } from '../../hooks/useVisibleNav';
import { pickBilingual } from '../../utils/locale';
import { BrandLogo } from '../common/BrandLogo';
import { ExternalLink } from '../common/ExternalLink';

/** Compact footer: brand, quick links, portals and helplines. */
export function SiteFooter() {
  const { t, locale } = useLanguage();
  const { data } = useSiteSettings();
  const settings = data?.data;
  const links = useVisibleFooterLinks();
  const hrefs = usePortalHrefs();

  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <section className="site-footer__brand" aria-labelledby="footer-about">
          <h2 id="footer-about" className="visually-hidden">{t('footer.about')}</h2>
          <BrandLogo variant="footer" to={ROUTES.home} />
          <p>{t('footer.aboutText')}</p>
        </section>
        <nav aria-labelledby="footer-links">
          <h2 id="footer-links">{t('footer.quickLinks')}</h2>
          <ul className="site-footer__links">
            {links.map((item) => <li key={item.id}><Link to={item.to ?? '/'}>{t(item.labelKey)}</Link></li>)}
          </ul>
        </nav>
        <section aria-labelledby="footer-portals">
          <h2 id="footer-portals">{t('footer.portals')}</h2>
          <ul>
            <li><ExternalLink href={hrefs.employee}>{t('login.employees')}</ExternalLink></li>
            <li><ExternalLink href={hrefs.pensioner}>{t('login.pensioners')}</ExternalLink></li>
            <li><ExternalLink href={hrefs.administrator}>{t('login.administrator')}</ExternalLink></li>
            <li><ExternalLink href={hrefs.trackClaim}>{t('nav.trackClaim')}</ExternalLink></li>
            <li><ExternalLink href={APP_CONFIG.sourceSiteUrl}>{t('footer.portalSite')}</ExternalLink></li>
          </ul>
        </section>
        <section aria-labelledby="footer-help">
          <h2 id="footer-help">{t('footer.helplines')}</h2>
          {settings ? (
            <ul>
              {settings.helplines.map((line) => {
                const label = pickBilingual(line.label, locale);
                return (
                  <li key={line.id}>
                    <span lang={label.lang}>{label.text}</span>: <a href={line.telHref}>{line.number}</a>
                  </li>
                );
              })}
              <li>{t('support.availability', { hours: settings.availability })}</li>
            </ul>
          ) : (
            <p>{t('support.unavailable')}</p>
          )}
        </section>
      </div>
      <div className="site-footer__legal">
        <div className="container">
          <p>© {new Date().getFullYear()} {t('footer.rights')}</p>
        </div>
      </div>
    </footer>
  );
}
