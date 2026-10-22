import { useState } from 'react';
import { telHrefFor } from '@nhis/shared-types';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteContent } from '../../hooks/useSiteContent';
import { pickBilingual } from '../../utils/locale';
import { Icon } from '../common/Icon';

/** Scrolling helpline strip above the header: heading, helplines and availability come from the header content. */
export function SupportStrip() {
  const [paused, setPaused] = useState(false);
  const { t, locale } = useLanguage();
  const { header } = useSiteContent().content;

  const helplines = header.helplines.filter((line) => line.visible);
  if (!helplines.length) return null;

  const { availability } = header;
  const heading = pickBilingual(header.helplineHeading, locale);
  const pauseLabel = t('support.pause');
  const resumeLabel = t('support.resume');

  return (
    <div
      className="support-strip"
      role="region"
      aria-label={t('support.region')}
      lang={locale}
    >
      <div className="container support-strip__inner">
        <span className="support-strip__title">
          <Icon name="phone" size={16} />
          <span lang={heading.lang}>{heading.text}</span>
        </span>

        <div
          className="support-strip__viewport"
          data-paused={paused}
        >
          <div className="support-strip__track">
            {[false, true].map((duplicate) => (
              <ul key={String(duplicate)} className="support-strip__group" aria-hidden={duplicate || undefined} inert={duplicate || undefined}>
            {helplines.map((line) => {
              const label = pickBilingual(line.label, locale);

              return (
                <li key={line.id} className="support-strip__item">
                  <span
                    className="support-strip__separator"
                    aria-hidden="true"
                  >
                    •
                  </span>

                  <span lang={label.lang}>{label.text}:</span>

                  <a
                    href={telHrefFor(line.number)}
                    aria-label={t('support.callAria', {
                      label: label.text,
                      number: line.number,
                    })}
                  >
                    {line.number}
                  </a>
                </li>
              );
            })}

            {availability && (
              <li className="support-strip__item">
                <span
                  className="support-strip__separator"
                  aria-hidden="true"
                >
                  •
                </span>
                <span>{availability}</span>
              </li>
            )}
              </ul>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="support-strip__toggle"
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? resumeLabel : pauseLabel}
          aria-pressed={paused}
        >
          <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>
          <span>{paused ? resumeLabel : pauseLabel}</span>
        </button>
      </div>
    </div>
  );
}
