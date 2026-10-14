import { Link } from 'react-router-dom';
import { usePortalHrefs } from '../../hooks/usePortals';
import { ROUTES } from '../../config/routes';
import { useLanguage } from '../../context/LanguageContext';
import type { MessageKey } from '../../locales';
import { Icon, type IconName } from '../common/Icon';
import './scheme.css';

interface Tile { id: string; icon: IconName; labelKey: MessageKey; to?: string; external?: boolean }

const TILES: ReadonlyArray<Tile> = [
  { id: 'hospitals', icon: 'hospital', labelKey: 'nav.hospitals', to: ROUTES.hospitals },
  { id: 'coverage', icon: 'shield', labelKey: 'nav.coverage', to: ROUTES.coverage },
  { id: 'eligibility', icon: 'users', labelKey: 'nav.eligibility', to: ROUTES.eligibility },
  { id: 'enroll', icon: 'clipboard', labelKey: 'nav.enroll', to: ROUTES.enrollment },
  { id: 'forms', icon: 'file', labelKey: 'nav.forms', to: ROUTES.forms },
  { id: 'track', icon: 'search', labelKey: 'nav.trackClaim', external: true },
];

/** Direct routes to the most common tasks. The claim-tracking tile leaves this site for the existing NHIS portal. */
export function QuickAccess() {
  const { t } = useLanguage();
  const hrefs = usePortalHrefs();
  return (
    <section className="quick" aria-labelledby="quick-title">
      <h2 id="quick-title">{t('home.quickHeading')}</h2>
      <ul className="quick__list">
        {TILES.map((tile) => {
          const body = (
            <>
              <span className="quick__icon"><Icon name={tile.icon} size={22} /></span>
              <span className="quick__text">
                <span className="quick__label">{t(tile.labelKey)}</span>
                {tile.external && <span className="quick__hint text-muted">{t('home.quickTrackHint')}</span>}
              </span>
              <Icon name={tile.external ? 'external' : 'arrowRight'} size={18} className="quick__arrow" />
            </>
          );
          return (
            <li key={tile.id}>
              {tile.external ? (
                <a className="quick__link" href={hrefs.trackClaim} target="_blank" rel="noopener noreferrer">
                  {body}
                  <span className="visually-hidden"> ({t('common.opensInNewTab')})</span>
                </a>
              ) : (
                <Link className="quick__link" to={tile.to ?? '/'}>{body}</Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
