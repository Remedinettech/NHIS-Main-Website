import type { ImgHTMLAttributes } from 'react';
import type { SiteImage as SiteImageData } from '@nhis/shared-types';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteContent } from '../../hooks/useSiteContent';
import { siteImageAlt, siteImageSize, siteImageUrl } from '../../utils/siteImages';

interface SiteImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height' | 'loading' | 'decoding'> {
  image: SiteImageData;
  /** Defers loading until the image is near the viewport (below-the-fold images such as logos). */
  lazy?: boolean;
}

/**
 * A managed image (uploaded or built-in). The alt text is the image's own bilingual text (English when no Tamil text
 * exists, then marked lang="en"). `width`/`height` are the image's intrinsic size when known, so the browser reserves
 * the right aspect ratio; the component never forces a size or crops: size it with CSS (`object-fit: contain`).
 * Renders nothing when the image has no address. In preview mode uploaded images come from the administration.
 */
export function SiteImage({ image, lazy = false, ...rest }: SiteImageProps) {
  const { locale } = useLanguage();
  const { preview } = useSiteContent();
  const src = siteImageUrl(image, { preview });
  if (!src) return null;
  const alt = siteImageAlt(image, locale);
  return (
    <img
      {...rest}
      src={src}
      alt={alt.text}
      lang={alt.lang === locale ? undefined : alt.lang}
      {...siteImageSize(image)}
      loading={lazy ? 'lazy' : undefined}
      decoding="async"
    />
  );
}
