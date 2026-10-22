import { telHrefFor, type LinkItem, type NavigationContent, type PortalLink, type SiteContentMap, type SiteSettings } from '@nhis/shared-types';

/** The part of GET /api/v1/site that describes the scheme: everything except the announcements and the timestamp. */
export type SiteFacts = Pick<SiteSettings, 'schemeName' | 'coverageStatement' | 'helplines' | 'availability' | 'portals'>;

/** The https address a visitor reaches through the link, or null for a hidden link and for targets that are not web addresses. */
const publicHref = (link: LinkItem): string | null => (link.visible && link.target.type === 'external' ? link.target.url : null);

/** The "Track Claim" link of the navigation: a link of a visible top-level position or of a visible menu. */
function trackClaimLink(navigation: NavigationContent): LinkItem | undefined {
  for (const item of navigation.items) {
    if (item.type === 'link') {
      if (item.id === 'track-claim') return item;
    } else if (item.visible) {
      const found = item.children.find((child) => child.type === 'link' && child.id === 'track-claim');
      if (found?.type === 'link') return found;
    }
  }
  return undefined;
}

/**
 * What GET /api/v1/site says about the scheme, taken from the effective site content instead of the retired SiteSetting
 * rows (the Admin edits the documents now): the scheme name and the coverage statement are the homepage hero, the helplines
 * and the availability are the header, and the portals are the visible external links of the login menu, the Track Claim
 * link of the navigation and the "Forgot password" link. Hidden entries are not part of the answer.
 */
export function siteFactsFromContent(content: Pick<SiteContentMap, 'header' | 'home' | 'navigation'>): SiteFacts {
  const { header, home, navigation } = content;
  const trackClaim = trackClaimLink(navigation);
  const portalLinks: Array<{ id: string; link: LinkItem }> = [
    ...header.loginMenu.items.map((link) => ({ id: link.id, link })),
    ...(trackClaim ? [{ id: 'trackClaim', link: trackClaim }] : []),
    { id: header.loginMenu.forgotPassword.id, link: header.loginMenu.forgotPassword },
  ];
  const portals: PortalLink[] = [];
  for (const { id, link } of portalLinks) {
    const href = publicHref(link);
    if (href !== null) portals.push({ id, label: { ...link.label }, href });
  }
  return {
    schemeName: { ...home.hero.title },
    coverageStatement: { ...home.hero.coverageStatement },
    helplines: header.helplines
      .filter((helpline) => helpline.visible)
      .map((helpline) => ({ id: helpline.id, label: { ...helpline.label }, number: helpline.number, telHref: telHrefFor(helpline.number) })),
    availability: header.availability,
    ...(portals.length > 0 ? { portals } : {}),
  };
}
