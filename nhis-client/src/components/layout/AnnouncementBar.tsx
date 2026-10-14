import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettings } from '../../context/SiteSettingsContext';
import { InlineContent } from '../content/InlineContent';
import { Notice } from '../common/Notice';

/**
 * Persistent notice area (e.g. hospitals suspended from the network). Static text: no marquee, no blinking.
 * The login-support announcement is shown in the support strip instead, so it is not repeated here.
 */
export function AnnouncementBar() {
  const { t, locale } = useLanguage();
  const { data } = useSiteSettings();
  const notices = data?.data.announcements.filter((item) => item.kind !== 'login-support') ?? [];
  if (notices.length === 0) return null;

  return (
    <section className="announcements" aria-label={t('announcements.region')}>
      <div className="container announcements__inner">
        {notices.map((notice) => {
          const hasPreferred = notice.message[locale].length > 0;
          const lang = hasPreferred ? locale : locale === 'en' ? 'ta' : 'en';
          const nodes = notice.message[lang];
          return (
            <Notice key={notice.id} tone={notice.severity === 'warning' ? 'warning' : 'info'} role="note" lang={lang}>
              <p className="announcement__text"><InlineContent nodes={nodes} lang={lang} /></p>
            </Notice>
          );
        })}
      </div>
    </section>
  );
}
