import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation } from '../../hooks/useMutation';
import { formatBytes } from '../../utils/format';
import { acceptAttribute, checkUploadFile, UPLOAD_DETACHED_MESSAGE, UPLOAD_RULES } from '../../utils/uploadRules';
import { resolveApiUrl } from '../../utils/urls';
import { Button } from '../common/Button';
import { TextField } from '../common/fields';
import { describeMutationError } from '../common/errorMessage';
import { useToast } from '../common/Toast';
import { uploadAsset } from '../common/FileUploadField';
import { Icon } from '../common/Icon';
import { CLIENT_BASE_URL } from '../../config/siteContent';
import { adminAssetPath, assetIdProblem, builtInFileName, builtInImageUrl } from './siteForm';
import './site.css';

export interface ImagePickerProps {
  /** Name of the picture ("Government emblem"): part of the button names for screen readers. */
  label: string;
  /** Uploaded image (MediaAsset id), or null. */
  assetId: string | null;
  /** Path of the image shipped with the website, shown as a "Built-in image" tile while there is no upload. */
  builtIn?: string | null;
  /** Stored pixel size of the built-in image (shown only). */
  builtInSize?: { width: number | null; height: number | null };
  /** Called with the id of a picture that was just uploaded, or typed in "Use an image that was uploaded before". */
  onAssetChange: (assetId: string) => void;
  /** Shows "Reset to built-in image". */
  onReset?: () => void;
  /** Shows "Remove image". */
  onRemove?: () => void;
  optional?: boolean;
  hint?: ReactNode;
  /** Error from the form (validator or server) for the picture itself. */
  error?: string;
  disabled?: boolean;
}

/** What the tab learned about an uploaded image after it loaded. Shown only; never stored or sent. */
interface NaturalSize { assetId: string; width: number; height: number }

/**
 * The picture part of an image field: preview, upload (JPEG, PNG, WebP, 5 MB, pre-checked here and again by the server),
 * reset, remove and "use an image that was uploaded before". It knows nothing about alt text; ImageField (site content) and
 * the picture block of the page editor add that. Uploaded images are previewed through the admin session because they are
 * private until published content uses them.
 */
export function ImagePicker({ label, assetId, builtIn, builtInSize, onAssetChange, onReset, onRemove, optional, hint, error, disabled }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [natural, setNatural] = useState<NaturalSize | null>(null);
  const toast = useToast();
  const upload = useMutation((file: File) => uploadAsset(file, 'image'));
  // The upload takes time; whoever called us may have changed (the alt text, for example) by the time it ends. Call the latest callbacks.
  const latest = useRef({ onAssetChange });
  latest.current = { onAssetChange };
  // The row may be removed, or move to another list (a partner changes group), while the file uploads. Its callbacks then belong to
  // a form snapshot that no longer exists: applying the result would bring a removed row back or undo the move.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkUploadFile(file, 'image');
    setLocalError(problem ?? undefined);
    if (problem) {
      setAnnouncement(problem);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setAnnouncement('Uploading the image…');
    const result = await upload.run(file);
    if (inputRef.current) inputRef.current.value = '';
    if (!result) return;
    if (!mounted.current) {
      if (result.ok) toast.error(UPLOAD_DETACHED_MESSAGE);
      return;
    }
    if (result.ok) {
      latest.current.onAssetChange(result.data.id);
      setAnnouncement(`Image ${result.data.originalName} uploaded (${formatBytes(result.data.bytes)}). Save to keep the change.`);
    } else {
      setAnnouncement('The image could not be uploaded.');
    }
  };

  const hasPicture = Boolean(assetId || builtIn);
  const shownError = localError ?? (upload.error ? describeMutationError(upload.error) : undefined) ?? error;
  const size = assetId && natural?.assetId === assetId ? { width: natural.width, height: natural.height } : null;

  return (
    <div className="image-field__main">
      <div className="image-field__preview">
        {assetId ? (
          <UploadedPreview key={assetId} assetId={assetId} onLoaded={(width, height) => setNatural({ assetId, width, height })} />
        ) : builtIn ? (
          <BuiltInPreview key={builtIn} path={builtIn} size={builtInSize} />
        ) : (
          <div className="image-field__tile">
            <Icon name="image" size={28} />
            <strong>No image</strong>
          </div>
        )}
      </div>
      <div className="image-field__side">
        <p className="image-field__meta">
          {assetId
            ? `Uploaded image${size ? `, ${size.width} × ${size.height} px` : ''}. It becomes public when this content is published.`
            : builtIn
              ? `Image shipped with the website (${builtInFileName(builtIn)}). Upload a picture to replace it.`
              : optional ? 'This picture is optional.' : 'Upload a picture.'}
        </p>
        <div className="image-field__buttons">
          <input
            ref={inputRef} type="file" className="visually-hidden" tabIndex={-1} accept={acceptAttribute('image')}
            aria-label={`Choose an image file for ${label}`} disabled={disabled || upload.pending}
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <Button variant="secondary" size="sm" disabled={disabled || upload.pending} aria-busy={upload.pending || undefined} onClick={() => inputRef.current?.click()}>
            {upload.pending ? 'Uploading…' : hasPicture ? 'Replace image' : 'Upload image'}<span className="visually-hidden"> for {label}</span>
          </Button>
          {onReset && !upload.pending && (
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => { onReset(); setAnnouncement('The built-in image is used again. Save to keep the change.'); }}>
              Reset to built-in image<span className="visually-hidden"> for {label}</span>
            </Button>
          )}
          {onRemove && !upload.pending && (
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => { onRemove(); setAnnouncement('The image was removed. Save to keep the change.'); }}>
              Remove image<span className="visually-hidden"> for {label}</span>
            </Button>
          )}
        </div>
        <p className="ff__hint">{UPLOAD_RULES.image.description}.{hint ? <> {hint}</> : null}</p>
        {shownError && <p className="ff__error" role="alert">{shownError}</p>}
        {assetId && <p className="ff__hint">Asset ID for Excel metadata imports: <code className="ff__code">{assetId}</code></p>}
        <ReuseAsset label={label} disabled={disabled || upload.pending} onUse={(id) => { latest.current.onAssetChange(id); setAnnouncement('The image was chosen. Save to keep the change.'); }} />
        <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
      </div>
    </div>
  );
}

/**
 * Takes the ID of a picture that was uploaded before. The text is applied only when "Use this image" is pressed, so no
 * request is made for half-typed IDs and a built-in picture is not replaced by a typing slip. The server checks that the
 * ID belongs to an uploaded image when the content is saved.
 */
function ReuseAsset({ label, disabled, onUse }: { label: string; disabled?: boolean; onUse: (assetId: string) => void }) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string>();
  const use = () => {
    const value = text.trim();
    const message = assetIdProblem(value);
    setProblem(message ?? undefined);
    if (message) return;
    onUse(value);
    setText('');
  };
  return (
    <details className="image-field__reuse">
      <summary>Use an image that was uploaded before<span className="visually-hidden"> for {label}</span></summary>
      {/* Enter in the box applies the ID. Left alone it would submit the whole editor form and save the draft instead. */}
      <div
        className="image-field__reuse-body"
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement)) return;
          event.preventDefault();
          if (!disabled) use();
        }}
      >
        <TextField
          label="Asset ID of the uploaded image" value={text} maxLength={64} disabled={disabled} error={problem}
          hint="Shown under an uploaded image as its asset ID. Local file paths and web addresses are not accepted."
          onChange={(next) => { setText(next); setProblem(undefined); }}
        />
        <Button variant="secondary" size="sm" disabled={disabled || text.trim() === ''} onClick={use}>Use this image<span className="visually-hidden"> for {label}</span></Button>
      </div>
    </details>
  );
}

/**
 * A picture that ships with the website, read from the public site (the same address the visitors' browsers use). When the
 * public site cannot be reached from here (for example the development server is not running), a neutral tile with the file name
 * and the stored pixel size is shown instead, so the editor always tells what the slot holds.
 */
function BuiltInPreview({ path, size }: { path: string; size?: { width: number | null; height: number | null } }) {
  const [failed, setFailed] = useState(false);
  const url = builtInImageUrl(CLIENT_BASE_URL, path);
  if (failed || !url) {
    return (
      <div className="image-field__tile">
        <Icon name="image" size={28} />
        <strong>Built-in image</strong>
        <span className="image-field__file">{builtInFileName(path)}</span>
        {size?.width && size.height && <span>{size.width} × {size.height} px</span>}
      </div>
    );
  }
  return <img className="image-field__img" src={url} alt={`Preview of the built-in image ${builtInFileName(path)}`} onError={() => setFailed(true)} />;
}

/** The uploaded file through the admin session. Reports its natural size once loaded and says so when it cannot be shown. */
function UploadedPreview({ assetId, onLoaded }: { assetId: string; onLoaded: (width: number, height: number) => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="image-field__tile">
        <Icon name="alert" size={28} />
        <strong>Preview not available</strong>
        <span>The uploaded image could not be loaded.</span>
      </div>
    );
  }
  return (
    <img
      className="image-field__img" src={resolveApiUrl(adminAssetPath(assetId))} alt="Preview of the uploaded image"
      onLoad={(event) => onLoaded(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} onError={() => setFailed(true)}
    />
  );
}
