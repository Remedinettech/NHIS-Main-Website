import { useLanguage } from '../../context/LanguageContext';
import { cx } from '../../utils/classNames';

/** English / தமிழ் selector. Language names are shown in their own script and are not translated. */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();
  return (
    <div className="lang-switch" role="group" aria-label={t('lang.select')}>
      <button type="button" lang="en" className={cx('lang-switch__btn', locale === 'en' && 'is-active')} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>
        English
      </button>
      <button type="button" lang="ta" className={cx('lang-switch__btn', locale === 'ta' && 'is-active')} aria-pressed={locale === 'ta'} onClick={() => setLocale('ta')}>
        தமிழ்
      </button>
    </div>
  );
}
