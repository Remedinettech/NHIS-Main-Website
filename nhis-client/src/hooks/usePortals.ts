import { PORTALS, type PortalLink } from '../config/portals';
import { useSiteSettings } from '../context/SiteSettingsContext';

type PortalId = PortalLink['id'];

/**
 * Portal destinations: the values managed in the administration (site settings) when available,
 * otherwise the built-in defaults, so links never disappear if settings cannot be loaded.
 */
export function usePortalHrefs(): Record<PortalId, string> {
  const { data } = useSiteSettings();
  const managed = new Map((data?.data.portals ?? []).map((portal) => [portal.id, portal.href]));
  const result = {} as Record<PortalId, string>;
  for (const id of Object.keys(PORTALS) as PortalId[]) result[id] = managed.get(id) ?? PORTALS[id].href;
  return result;
}
