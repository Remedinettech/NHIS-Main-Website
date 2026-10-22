import { SITE_CONTENT_LIMITS, type SiteImage } from '@nhis/shared-types';
import { useRef, type ReactNode } from 'react';
import { BilingualInput } from './BilingualInput';
import { ImagePicker } from './ImagePicker';
import { useSiteForm } from './SiteFormContext';
import { emptySiteImage, firstError, type FieldErrors } from './siteForm';
import './site.css';

export interface ImageFieldProps {
  /** Name of the picture, shown as the group legend ("Government emblem"). */
  label: string;
  /** Path of the image in the document ("emblem", "partners.3.logo"). Errors are read from it, from `${path}.assetId` and from `${path}.alt.*`. */
  path: string;
  /** The image, or null while an optional image is not set. */
  value: SiteImage | null;
  onChange: (next: SiteImage | null) => void;
  /** The shipped image of this slot (from DEFAULT_SITE_CONTENT). Enables "Reset to built-in image". */
  builtIn?: SiteImage | null;
  /** Optional image: shows "Remove image", which sets the value to null. Required images cannot be removed, only replaced. */
  optional?: boolean;
  hint?: ReactNode;
  /** Legend of the alt-text pair. */
  altLabel?: string;
  disabled?: boolean;
  /** Overrides the errors of the surrounding SiteContentEditor. */
  errors?: FieldErrors;
}

/**
 * A picture with its required alt text. Uploaded images are previewed through the admin session (the image is private
 * until published content uses it); images shipped with the website are previewed from the public site (the address of
 * "Preview on website"), with a neutral "Built-in image" tile (file name and the pixel size stored in the content) when
 * the public site cannot be reached from here. Upload checks type
 * (JPEG, PNG, WebP) and size (5 MB) before sending; the server checks again and reads the real pixel size, so this
 * component never sends width or height (it stores null for an upload).
 */
export function ImageField({ label, path, value, onChange, builtIn, optional, hint, altLabel, disabled, errors }: ImageFieldProps) {
  const form = useSiteForm();
  const errs = errors ?? form.errors;
  const off = disabled || form.readOnly;
  // An upload takes a while: build the new image from the alt text as it is when the upload ends, not when it started.
  const current = useRef(value);
  current.current = value;

  const canReset = Boolean(builtIn) && (value === null || value.assetId !== null || value.builtIn !== builtIn?.builtIn);
  const reset = () => {
    if (!builtIn) return;
    // Only the picture goes back; alt text the editor wrote is kept.
    const alt = current.current && current.current.alt.en.trim() !== '' ? current.current.alt : builtIn.alt;
    onChange({ ...builtIn, alt });
  };

  const pictureError = firstError(errs, path, `${path}.assetId`, `${path}.builtIn`, `${path}.width`, `${path}.height`);

  return (
    <fieldset className="image-field" disabled={off}>
      <legend className="bilingual__legend">{label}{!optional && <span className="ff__req" aria-hidden="true"> *</span>}</legend>
      <ImagePicker
        label={label} assetId={value?.assetId ?? null} builtIn={value?.builtIn ?? null} builtInSize={value ? { width: value.width, height: value.height } : undefined}
        optional={optional} hint={hint} error={pictureError} disabled={off}
        // Keep the alt text of the picture that is being replaced. The size is left null: the server reads it from the file.
        onAssetChange={(assetId) => onChange({ assetId, builtIn: null, alt: current.current?.alt ?? emptySiteImage().alt, width: null, height: null })}
        onReset={canReset ? reset : undefined}
        onRemove={optional && value ? () => onChange(null) : undefined}
      />
      {value && (
        <BilingualInput
          label={altLabel ?? 'Alt text (describes the picture to people who cannot see it)'} path={`${path}.alt`} required limit={SITE_CONTENT_LIMITS.alt}
          value={value.alt} onChange={(alt) => onChange({ ...value, alt })} errors={errs} disabled={off}
        />
      )}
    </fieldset>
  );
}
