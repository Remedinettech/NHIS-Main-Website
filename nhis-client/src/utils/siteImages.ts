import { BUILT_IN_ASSET_PATTERN, type Bilingual, type Locale, type SiteImage } from '@nhis/shared-types';
import { pickBilingual } from './locale';
import { assetUrl, resolveApiUrl } from './urls';

/** Anything that carries the image fields the Client needs (a full SiteImage qualifies). */
export type SiteImageSource = Pick<SiteImage, 'assetId' | 'builtIn'>;

/**
 * Address of a managed image, correct under any IIS sub-path:
 * - an uploaded image (`assetId`) is served by the API at /files/<id> (public, once a published document uses it), or, in
 *   preview mode, at /admin/files/<id> (the administrator's session cookie authorises it, drafts included);
 * - a built-in image (`builtIn`, a file of the Client build such as "assets/hitpa-logo.png") comes from the Client's own
 *   public folder;
 * - anything else (no image, or a path that is not an allowed built-in file) has no address.
 * An uploaded image wins over a built-in path, like everywhere else.
 */
export function siteImageUrl(image: SiteImageSource | null | undefined, options: { preview?: boolean } = {}): string | undefined {
  if (!image) return undefined;
  if (image.assetId) {
    const id = encodeURIComponent(image.assetId);
    return resolveApiUrl(options.preview ? `/api/v1/admin/files/${id}` : `/api/v1/files/${id}`);
  }
  if (image.builtIn && BUILT_IN_ASSET_PATTERN.test(image.builtIn)) return assetUrl(image.builtIn);
  return undefined;
}

/** Alt text in the current language (English fallback when no Tamil text exists) with the language it is written in. */
export function siteImageAlt(image: Pick<SiteImage, 'alt'>, locale: Locale): { text: string; lang: Locale } {
  return pickBilingual(image.alt, locale);
}

/**
 * The image with `fallback` as its alt text when it has none in either language. The alt text written for the image always
 * comes first (in the current language, then in English, see `siteImageAlt`); the fallback is only for an image without any.
 */
export function withAltFallback(image: SiteImage, fallback: Bilingual): SiteImage {
  const hasAlt = image.alt.en.trim() !== '' || image.alt.ta.trim() !== '';
  return hasAlt ? image : { ...image, alt: fallback };
}

/** `width`/`height` attributes for the browser to reserve the right aspect ratio, only when both are known. */
export function siteImageSize(image: Pick<SiteImage, 'width' | 'height'>): { width?: number; height?: number } {
  return image.width && image.height ? { width: image.width, height: image.height } : {};
}

/** Height class of a partner logo (`partner-logo--<shape>` in components/scheme/scheme.css). */
export type LogoShape = 'emblem' | 'wide' | 'banner' | 'stacked';

/** The logos shipped with the Client keep the heights they were balanced with. */
const BUILT_IN_LOGO_SHAPES: Readonly<Record<string, LogoShape>> = {
  'assets/united-india-insurance-logo.png': 'emblem',
  'assets/vidal-health-logo.png': 'banner',
  'assets/medi-assist-logo.png': 'wide',
  'assets/hitpa-logo.png': 'stacked',
};

/**
 * Height class of a logo: shipped logos keep their tuned class, any other image (an upload, or a built-in file that
 * was added later) gets one from its proportions, so a long strip is not drawn as tall as a square emblem and a tall
 * logo gets room. The size never forces the shape: CSS only limits the height (and the width to the box), the browser
 * keeps the proportions. A logo without a known size is treated as a square emblem.
 */
export function logoShape(image: Pick<SiteImage, 'assetId' | 'builtIn' | 'width' | 'height'>): LogoShape {
  if (!image.assetId && image.builtIn && Object.prototype.hasOwnProperty.call(BUILT_IN_LOGO_SHAPES, image.builtIn)) {
    return BUILT_IN_LOGO_SHAPES[image.builtIn];
  }
  const { width, height } = image;
  if (!width || !height) return 'emblem';
  const ratio = width / height;
  if (ratio >= 3) return 'banner';
  if (ratio >= 2) return 'wide';
  if (ratio < 0.8) return 'stacked';
  return 'emblem';
}

/** The only address shape the API gives a gallery picture: the public file route of an uploaded image. */
const GALLERY_IMAGE_PATH = /^\/api\/v1\/files\/[A-Za-z0-9_-]{8,64}$/;

/**
 * Address of a gallery picture, correct under any IIS sub-path. Only the public file route of the API is accepted; any
 * other address (another site, a protocol-relative "//host/..." address, a path of this site) has no picture.
 */
export function galleryImageUrl(imageUrl: string): string | undefined {
  return GALLERY_IMAGE_PATH.test(imageUrl) ? resolveApiUrl(imageUrl) : undefined;
}
