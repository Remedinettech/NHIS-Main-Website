import type { ImageBlock } from '@nhis/shared-types';
import { CountedControl } from '../site/CountedControl';
import { ImagePicker } from '../site/ImagePicker';
import '../site/site.css';

/** Limits of the picture block (the same as the server: nhis-api content-validation.ts parseImageBlock). */
export const IMAGE_BLOCK_LIMITS = { alt: 250, caption: 300 } as const;

/** Same rule as the server for the id of an uploaded image. */
const ASSET_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Problems with a picture block of a page, keyed like the server's field paths (`<path>.assetId`, `.alt`, `.caption`). */
export function imageBlockProblems(block: ImageBlock, path: string): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!block.assetId.trim()) problems[`${path}.assetId`] = 'Upload a picture.';
  else if (!ASSET_ID.test(block.assetId.trim())) problems[`${path}.assetId`] = 'This is not a valid uploaded image.';
  const alt = block.alt.trim();
  if (!alt) problems[`${path}.alt`] = 'Describe the picture for people who cannot see it (alt text).';
  else if (alt.length > IMAGE_BLOCK_LIMITS.alt) problems[`${path}.alt`] = `Too long: ${alt.length} characters, the limit is ${IMAGE_BLOCK_LIMITS.alt}.`;
  if ((block.caption ?? '').trim().length > IMAGE_BLOCK_LIMITS.caption) problems[`${path}.caption`] = `Too long: ${(block.caption ?? '').trim().length} characters, the limit is ${IMAGE_BLOCK_LIMITS.caption}.`;
  return problems;
}

interface Props {
  block: ImageBlock;
  onChange: (block: ImageBlock) => void;
  /** Path of the block in the page, for example `en.sections.0.blocks.2`. */
  path: string;
  errors: Record<string, string>;
  /** Language of this version of the page: the alt text and caption are written in it. */
  lang: 'en' | 'ta';
  disabled?: boolean;
  /** Names this picture for screen readers ("Picture 2 in section 1"): the buttons of every picture of a page would otherwise sound alike. */
  name?: string;
}

/**
 * A picture inside a page: upload (or reuse an uploaded picture), the alt text and an optional caption. A page version is
 * written in one language, so the alt text and the caption are single texts in that language (unlike the bilingual image
 * fields of the site content).
 */
export function PageImageBlock({ block, onChange, path, errors, lang, disabled, name = 'the picture' }: Props) {
  const language = lang === 'ta' ? 'Tamil' : 'English';
  return (
    <fieldset className="image-field" disabled={disabled}>
      <legend className="bilingual__legend">Picture<span className="ff__req" aria-hidden="true"> *</span></legend>
      <ImagePicker
        label={name} assetId={block.assetId || null} disabled={disabled} error={errors[`${path}.assetId`]}
        // The size is filled in by the server from the stored file; whatever the browser knew is dropped when the picture changes.
        onAssetChange={(assetId) => onChange({ ...block, assetId, width: null, height: null })}
      />
      <CountedControl
        label={`Alt text in ${language} (describes the picture to people who cannot see it)`} required lang={lang} value={block.alt} limit={IMAGE_BLOCK_LIMITS.alt}
        onChange={(alt) => onChange({ ...block, alt })} error={errors[`${path}.alt`]} disabled={disabled}
      />
      <CountedControl
        label={`Caption in ${language} (optional)`} lang={lang} value={block.caption ?? ''} limit={IMAGE_BLOCK_LIMITS.caption}
        onChange={(caption) => onChange({ ...block, caption })} error={errors[`${path}.caption`]} disabled={disabled}
      />
    </fieldset>
  );
}
