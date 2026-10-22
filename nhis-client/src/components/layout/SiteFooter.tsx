import { isSafeHttpsUrl, telHrefFor } from '@nhis/shared-types';
import { ROUTES } from '../../config/routes';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteContent } from '../../hooks/useSiteContent';
import { useLinkContext, useVisibleFooterGroups } from '../../hooks/useVisibleNav';
import { pickBilingual } from '../../utils/locale';
import { siteImageUrl } from '../../utils/siteImages';
import { resolveLink } from '../../utils/siteLinks';
import { BrandLogo } from '../common/BrandLogo';
import { SiteImage } from '../common/SiteImage';
import { BilingualText, SiteLink } from '../common/SiteLink';

/** A link group with more links than this is laid out in two columns (the built-in "Quick links" has 10 or 11). */
const TWO_COLUMN_FROM = 7;

/**
 * Footer, from the footer content (logos, about text, link groups, contact, copyright) and the header's helplines.
 * Hidden groups, links and logos are left out; the copyright text's `{year}` is the current year.
 */
export function SiteFooter() {
  const { t, locale } = useLanguage();
  const { content, preview } = useSiteContent();
  const { header, footer } = content;
  const groups = useVisibleFooterGroups();
  const context = useLinkContext();

  const helplines = header.helplines.filter((line) => line.visible);
  const showHelplines = footer.helplines.visible && helplines.length > 0;
  const logos = footer.logos.filter((logo) => logo.visible && siteImageUrl(logo.image, { preview }) !== undefined);

  const { contact } = footer;
  const address = pickBilingual(contact.address, locale);
  const email = contact.email ? resolveLink({ type: 'email', address: contact.email }, context) : null;
  const phone = contact.phone ? resolveLink({ type: 'phone', number: contact.phone.replace(/[\s-]/g, '') }, context) : null;
  const showContact = contact.visible && (address.text !== '' || contact.email !== '' || contact.phone !== '');

  const copyright = pickBilingual(footer.copyright, locale);
  const copyrightText = copyright.text.split('{year}').join(String(new Date().getFullYear()));

  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <section className="site-footer__brand" aria-labelledby="footer-about">
          <h2 id="footer-about" className={footer.showWordmark ? 'visually-hidden' : undefined}><BilingualText value={footer.about.heading} /></h2>
          {footer.showWordmark && <BrandLogo variant="footer" to={ROUTES.home} />}
          {logos.length > 0 && (
            <ul className="site-footer__logos">
              {logos.map((logo) => {
                const image = <SiteImage image={logo.image} lazy />;
                return (
                  <li key={logo.id} className="site-footer__logo">
                    {logo.url && isSafeHttpsUrl(logo.url) ? (
                      <a href={logo.url} target="_blank" rel="noopener noreferrer">
                        {image}
                        <span className="visually-hidden"> ({t('common.opensInNewTab')})</span>
                      </a>
                    ) : image}
                  </li>
                );
              })}
            </ul>
          )}
          <p><BilingualText value={footer.about.text} /></p>
        </section>
        {showContact && (
          <section aria-labelledby="footer-contact">
            <h2 id="footer-contact"><BilingualText value={contact.heading} /></h2>
            <ul>
              {address.text && <li className="site-footer__address" lang={address.lang}>{address.text}</li>}
              {contact.email && <li>{email ? <a href={email.href}>{contact.email}</a> : contact.email}</li>}
              {contact.phone && <li>{phone ? <a href={phone.href}>{contact.phone}</a> : contact.phone}</li>}
            </ul>
          </section>
        )}
        {groups.map(({ group, links }) => (
          <nav key={group.id} aria-labelledby={`footer-group-${group.id}`}>
            <h2 id={`footer-group-${group.id}`}><BilingualText value={group.heading} /></h2>
            <ul className={links.length >= TWO_COLUMN_FROM ? 'site-footer__links' : undefined}>
              {links.map(({ item }) => <li key={item.id}><SiteLink item={item} /></li>)}
            </ul>
          </nav>
        ))}
        {showHelplines && (
          <section aria-labelledby="footer-help">
            <h2 id="footer-help"><BilingualText value={footer.helplines.heading} /></h2>
            <ul>
              {helplines.map((line) => {
                const label = pickBilingual(line.label, locale);
                return (
                  <li key={line.id}>
                    <span lang={label.lang}>{label.text}</span>: <a href={telHrefFor(line.number)}>{line.number}</a>
                  </li>
                );
              })}
              {header.availability && <li>{t('support.availability', { hours: header.availability })}</li>}
            </ul>
          </section>
        )}

      </div>
      <div className="site-footer__legal">
        <div className="container">
          <p lang={copyright.lang === locale ? undefined : copyright.lang}>{copyrightText}</p>
        </div>
      </div>
    </footer>
  );
}
