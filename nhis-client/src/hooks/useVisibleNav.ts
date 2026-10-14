import { useEffect, useState } from 'react';
import { FOOTER_LINKS, PRIMARY_NAV, type NavItem, type NavLinkItem } from '../config/navigation';
import { getGallery } from '../services/content.api';

/**
 * Whether the gallery has published items. A navigation entry must always open a populated page,
 * so the Gallery link stays hidden until the API returns at least one item.
 */
export function useGalleryAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    getGallery(controller.signal)
      .then((response) => { if (!controller.signal.aborted) setAvailable(response.total > 0); })
      .catch(() => { /* keep the link hidden when availability is unknown */ });
    return () => controller.abort();
  }, []);
  return available;
}

export function useVisibleNav(): ReadonlyArray<NavItem> {
  const gallery = useGalleryAvailable();
  return gallery ? PRIMARY_NAV : PRIMARY_NAV.filter((item) => item.id !== 'gallery');
}

export function useVisibleFooterLinks(): ReadonlyArray<NavLinkItem> {
  const gallery = useGalleryAvailable();
  return gallery ? FOOTER_LINKS : FOOTER_LINKS.filter((item) => item.id !== 'gallery');
}
