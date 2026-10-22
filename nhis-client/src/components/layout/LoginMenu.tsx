import { useId } from 'react';
import { useDismissableMenu } from '../../hooks/useDismissableMenu';
import { useSiteContent } from '../../hooks/useSiteContent';
import { useLinkContext } from '../../hooks/useVisibleNav';
import { visibleLinks } from '../../utils/siteLinks';
import { Icon } from '../common/Icon';
import { BilingualText, SiteLink } from '../common/SiteLink';

/**
 * Role login menu (header content: button label, heading, items, forgot-password link). Every item opens the
 * corresponding NHIS portal; this site never collects credentials. Hidden items and items whose target cannot be
 * shown are left out, and a menu without any item is not shown at all.
 */
export function LoginMenu() {
  const { open, setOpen, containerRef, triggerRef, onBlur } = useDismissableMenu();
  const panelId = useId();
  const { loginMenu } = useSiteContent().content.header;
  const context = useLinkContext();

  const items = visibleLinks(loginMenu.items, context);
  const [forgot] = visibleLinks([loginMenu.forgotPassword], context);
  if (items.length === 0 && !forgot) return null;

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
        <span><BilingualText value={loginMenu.label} /></span>
        <Icon name="chevronDown" size={16} className="login-menu__chevron" />
      </button>
      <div id={panelId} className="login-menu__panel" hidden={!open}>
        <p className="login-menu__heading"><BilingualText value={loginMenu.heading} /></p>
        {items.length > 0 && (
          <ul className="login-menu__list">
            {items.map(({ item }) => (
              <li key={item.id}><SiteLink item={item} className="login-menu__link" /></li>
            ))}
          </ul>
        )}
        {forgot && <SiteLink item={forgot.item} className="login-menu__forgot" />}
      </div>
    </div>
  );
}
