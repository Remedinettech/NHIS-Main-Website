import { useRef, type KeyboardEvent } from 'react';
import type { ContactDirectoryId, ContactDirectorySummary } from '@nhis/shared-types';
import { useLanguage } from '../../context/LanguageContext';
import type { MessageKey } from '../../locales';
import { cx } from '../../utils/classNames';
import './contacts.css';

interface ContactTabsProps {
  directories: ReadonlyArray<ContactDirectorySummary>;
  active: ContactDirectoryId;
  onSelect: (id: ContactDirectoryId) => void;
  idPrefix: string;
}

/** Accessible tab list (arrow keys, Home/End) for the four contact directories. */
export function ContactTabs({ directories, active, onSelect, idPrefix }: ContactTabsProps) {
  const { t } = useLanguage();
  const refs = useRef(new Map<ContactDirectoryId, HTMLButtonElement>());

  const move = (index: number) => {
    const target = directories[(index + directories.length) % directories.length];
    onSelect(target.id);
    refs.current.get(target.id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); move(index + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); move(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); move(0); }
    else if (event.key === 'End') { event.preventDefault(); move(directories.length - 1); }
  };

  return (
    <div className="contact-tabs" role="tablist" aria-label={t('contacts.tablistLabel')}>
      {directories.map((directory, index) => {
        const selected = directory.id === active;
        return (
          <button
            key={directory.id}
            ref={(node) => { if (node) refs.current.set(directory.id, node); else refs.current.delete(directory.id); }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${directory.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${directory.id}`}
            tabIndex={selected ? 0 : -1}
            className={cx('contact-tabs__tab', selected && 'is-active')}
            onClick={() => onSelect(directory.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span>{t(`contacts.directories.${directory.id}` as MessageKey)}</span>
            <span className="contact-tabs__count">{directory.total}</span>
          </button>
        );
      })}
    </div>
  );
}
