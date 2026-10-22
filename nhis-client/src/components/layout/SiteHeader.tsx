import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ROUTES } from '../../config/routes';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteContent } from '../../hooks/useSiteContent';
import { cx } from '../../utils/classNames';
import { pickBilingual } from '../../utils/locale';
import { splitWordmark, wordmarkLanguage } from '../common/BrandLogo';
import { Icon } from '../common/Icon';
import { SiteImage } from '../common/SiteImage';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LoginMenu } from './LoginMenu';
import { PrimaryNav } from './PrimaryNav';
import './SiteHeader.css';

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

  const { header } = useSiteContent().content;
  const title = pickBilingual(header.title, locale);
  const subtitle = pickBilingual(header.subtitle, locale);
  const { head, tail } = splitWordmark(title.text);

  return (
    <header className="site-header nhis-header">
      <div className={cx('container', 'nhis-header__inner', !header.showPortrait && 'nhis-header__inner--no-portrait')}>
        <Link
          className="nhis-header__identity"
          to={ROUTES.home}
          aria-label={[title.text, subtitle.text].filter(Boolean).join(' — ')}
        >
          <SiteImage className="nhis-header__emblem" image={header.emblem} />

          <span className="nhis-header__wordmark">
            <span className="nhis-header__name" lang={wordmarkLanguage(title.text, title.lang)}>
              <span>{head}</span>
              {tail && <span className="nhis-header__hyphen">-</span>}
              {tail && <span className="nhis-header__name-blue">{tail}</span>}
            </span>

            {subtitle.text && (
              <span className="nhis-header__subtitle" lang={subtitle.lang}>
                {subtitle.text}
              </span>
            )}
          </span>
        </Link>

        {header.showPortrait && (
          <div className="nhis-header__portrait-frame">
            <SiteImage className="nhis-header__portrait" image={header.portrait} />
          </div>
        )}

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