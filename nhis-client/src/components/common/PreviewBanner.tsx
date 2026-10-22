import { useSiteContent } from '../../hooks/useSiteContent';
import { Icon } from './Icon';
import { T } from './T';

/**
 * Shown at the top of the page while the Client is opened with ?preview=1 (see usePreviewMode): it says that
 * unpublished changes are on screen, or, when the administration refused (no valid session in this browser), that the
 * published site is shown and how to see the changes. Renders nothing for visitors. Styled in components/layout/layout.css.
 */
export function PreviewBanner() {
  const { preview, previewDenied } = useSiteContent();
  if (!preview && !previewDenied) return null;
  return (
    <div className={previewDenied ? 'preview-banner preview-banner--denied' : 'preview-banner'} role="status">
      <div className="container preview-banner__inner">
        <Icon name="info" size={18} />
        <p><T k={previewDenied ? 'preview.signIn' : 'preview.banner'} /></p>
      </div>
    </div>
  );
}
