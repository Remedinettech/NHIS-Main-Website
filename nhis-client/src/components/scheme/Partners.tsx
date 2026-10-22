import { isSafeHttpsUrl, type PartnerCategory, type PartnerEntry, type PartnersContent } from '@nhis/shared-types';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteContent } from '../../hooks/useSiteContent';
import { cx } from '../../utils/classNames';
import { pickBilingual } from '../../utils/locale';
import { logoShape, siteImageUrl, withAltFallback } from '../../utils/siteImages';
import { SiteImage } from '../common/SiteImage';
import { BilingualText } from '../common/SiteLink';
import './scheme.css';

export interface PartnerGroupView { category: PartnerCategory; partners: PartnerEntry[] }

/**
 * The partner groups to show, in the editor's order: visible groups with at least one visible partner whose logo has an
 * address (a logo that cannot be shown would leave an empty box). Partners of unknown groups are not shown.
 */
export function visiblePartnerGroups(content: PartnersContent, options: { preview?: boolean } = {}): PartnerGroupView[] {
  const shown = content.partners.filter((partner) => partner.visible && siteImageUrl(partner.logo, options) !== undefined);
  return content.categories
    .filter((category) => category.visible)
    .map((category) => ({ category, partners: shown.filter((partner) => partner.categoryId === category.id) }))
    .filter((group) => group.partners.length > 0);
}

/**
 * Partner logos. Every logo keeps its own proportions (the image carries its pixel size, CSS only limits the height and
 * the width and uses object-fit: contain), so no logo is stretched or cropped whatever the editor uploads. A partner
 * with a web address is a link to it (https only, new tab). The logo's alt text names it for assistive technology; the
 * partner's name (English when there is no Tamil name) is the tooltip (title) of the logo and the alt text of a logo that
 * has none of its own.
 */
export function Partners() {
  const { t, locale } = useLanguage();
  const { content, preview } = useSiteContent();
  const { partners } = content;
  const groups = visiblePartnerGroups(partners, { preview });
  if (groups.length === 0) return null;

  return (
    <section className="partners" aria-labelledby="partners-title">
      <h2 id="partners-title"><BilingualText value={partners.heading} /></h2>
      <div className="partners__grid">
        {groups.map(({ category, partners: members }) => (
          <figure key={category.id} className="partner-group">
            <figcaption><BilingualText value={category.caption} /></figcaption>
            <div className="partner-group__logos">
              {members.map((partner) => {
                const name = pickBilingual(partner.name, locale).text || undefined;
                const logo = <SiteImage image={withAltFallback(partner.logo, partner.name)} lazy className={cx('partner-logo', `partner-logo--${logoShape(partner.logo)}`)} />;
                return partner.url && isSafeHttpsUrl(partner.url) ? (
                  <a key={partner.id} className="partner-link" href={partner.url} title={name} target="_blank" rel="noopener noreferrer">
                    {logo}
                    <span className="visually-hidden"> ({t('common.opensInNewTab')})</span>
                  </a>
                ) : <span key={partner.id} className="partner-link" title={name}>{logo}</span>;
              })}
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}
