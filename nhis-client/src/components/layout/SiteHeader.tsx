import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ROUTES } from '../../config/routes';
import { useLanguage } from '../../context/LanguageContext';
import { Icon } from '../common/Icon';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LoginMenu } from './LoginMenu';
import { PrimaryNav } from './PrimaryNav';
import './SiteHeader.css';
import { assetUrl } from '../../utils/urls';

export function SiteHeader() {
  const { t, locale } = useLanguage();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navId = useId();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const schemeName =
    locale === 'ta'
      ? 'தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம்'
      : 'Tamil Nadu New Health Insurance Scheme';

  return (
    <header className="site-header nhis-header">
      <div className="container nhis-header__inner">
        <Link
          className="nhis-header__identity"
          to={ROUTES.home}
          aria-label={`TN-NHIS — ${schemeName}`}
        >
          <img
            className="nhis-header__emblem"
            src={assetUrl('assets/tn-government-emblem.png')}
            alt={t('site.emblemAlt')}
            width={76}
            height={82}
            decoding="async"
          />

          <span className="nhis-header__wordmark">
            <span className="nhis-header__name" lang="en">
              <span>TN</span>
              <span className="nhis-header__hyphen">-</span>
              <span className="nhis-header__name-blue">NHIS</span>
            </span>

            <span className="nhis-header__subtitle" lang={locale}>
              {schemeName}
            </span>
          </span>
        </Link>

        <div className="nhis-header__portrait-frame">
          <img
            className="nhis-header__portrait"
            src={assetUrl('assets/header-portrait.jpg')}
            alt={t('site.portraitAlt')}
            width={72}
            height={88}
            decoding="async"
          />
        </div>

        <div className="nhis-header__controls">
          <LanguageSwitcher />
          <LoginMenu />

          <button
            ref={toggleRef}
            type="button"
            className="menu-toggle nhis-header__menu-toggle"
            aria-expanded={menuOpen}
            aria-controls={navId}
            aria-label={
              menuOpen ? t('nav.closeMenu') : t('nav.openMenu')
            }
            onClick={() => setMenuOpen((previous) => !previous)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size={22} />
          </button>
        </div>
      </div>

      <PrimaryNav id={navId} open={menuOpen} />
    </header>
  );
}