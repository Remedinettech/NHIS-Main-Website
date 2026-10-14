import { useId } from 'react';
import { PORTALS, type PortalLink } from '../../config/portals';
import { useLanguage } from '../../context/LanguageContext';
import { usePortalHrefs } from '../../hooks/usePortals';
import { useDismissableMenu } from '../../hooks/useDismissableMenu';
import { ExternalLink } from '../common/ExternalLink';
import { Icon } from '../common/Icon';
import { T } from '../common/T';

const ROLE_LINKS: ReadonlyArray<PortalLink['id']> = ['employee', 'pensioner', 'administrator', 'insurer'];
const HOSPITAL_LINKS: ReadonlyArray<PortalLink['id']> = ['hospitalMediAssist', 'hospitalMdIndia'];

/** Role login menu. Every item opens the corresponding NHIS portal; this site never collects credentials. */
export function LoginMenu() {
  const { t } = useLanguage();
  const { open, setOpen, containerRef, triggerRef, onBlur } = useDismissableMenu();
  const panelId = useId();
  const hrefs = usePortalHrefs();

  const item = (id: PortalLink['id']) => (
    <li key={id}>
      <ExternalLink href={hrefs[id]} className="login-menu__link">
        <T k={PORTALS[id].labelKey} />
      </ExternalLink>
    </li>
  );

  return (
    <div className="login-menu" ref={containerRef} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="login-menu__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="login" size={18} />
        <span>{t('login.menu')}</span>
        <Icon name="chevronDown" size={16} className="login-menu__chevron" />
      </button>
      <div id={panelId} className="login-menu__panel" hidden={!open}>
        <p className="login-menu__heading">{t('login.roleHeading')}</p>
        <ul className="login-menu__list">{ROLE_LINKS.map(item)}</ul>
        <p className="login-menu__heading">{t('login.hospitals')}</p>
        <ul className="login-menu__list">{HOSPITAL_LINKS.map(item)}</ul>
        <ExternalLink href={hrefs.forgotPassword} className="login-menu__forgot">{t('login.forgotPassword')}</ExternalLink>
      </div>
    </div>
  );
}
