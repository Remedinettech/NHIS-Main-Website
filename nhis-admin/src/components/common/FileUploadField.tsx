import type { AdminAsset } from '@nhis/shared-types';
import { useId, useRef, useState } from 'react';
import { useMutation } from '../../hooks/useMutation';
import { adminApi } from '../../services/client';
import { formatBytes, truncateToken } from '../../utils/format';
import { acceptAttribute, checkUploadFile, UPLOAD_RULES, type UploadKind } from '../../utils/uploadRules';
import { Button } from './Button';
import { describeMutationError } from './errorMessage';
import { Icon } from './Icon';
import './forms.css';

/** POST /admin/uploads (multipart: file, kind). The server validates type, content and size again. */
export async function uploadAsset(file: File, kind: UploadKind): Promise<AdminAsset> {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  const body = await adminApi.upload<{ data: AdminAsset } | AdminAsset>('/uploads', form);
  return 'data' in body ? body.data : body;
}

interface FileUploadFieldProps {
  label: string;
  kind: UploadKind;
  /** The file currently attached (from the record), shown with name, size and hash prefix. */
  asset: AdminAsset | null;
  /** Called with the stored asset after a successful (2xx) upload. */
  onUploaded: (asset: AdminAsset) => void;
  /** Called when the user removes the attachment (omit to hide the Remove button). */
  onRemove?: () => void;
  required?: boolean;
  hint?: string;
  /** External error, for example a server field error on assetId. */
  error?: string;
  disabled?: boolean;
}

/**
 * Choose-and-upload control. Pre-checks type and size using the same limits as the server, uploads on selection, shows a
 * busy state (no progress bar) and then the stored file's name, size and hash prefix. Server validation is authoritative.
 */
export function FileUploadField({ label, kind, asset, onUploaded, onRemove, required, hint, error, disabled }: FileUploadFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string>();
  const upload = useMutation((file: File) => uploadAsset(file, kind));
  const rule = UPLOAD_RULES[kind];
  const shownError = localError ?? (upload.error ? describeMutationError(upload.error) : undefined) ?? error;
  const errorId = shownError ? `${id}-error` : undefined;

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkUploadFile(file, kind);
    setLocalError(problem ?? undefined);
    if (problem) { if (inputRef.current) inputRef.current.value = ''; return; }
    const result = await upload.run(file);
    if (inputRef.current) inputRef.current.value = '';
    if (result?.ok) onUploaded(result.data);
  };

  return (
    <div className={`ff upload ${shownError ? 'ff--invalid' : ''}`}>
      <label htmlFor={id} className="ff__label">
        {label}
        {required && <span className="ff__req" aria-hidden="true"> *</span>}
        {required && <span className="visually-hidden"> (required)</span>}
      </label>
      <div className="upload__box">
        {asset ? (
          <div className="upload__current">
            <Icon name={kind === 'image' ? 'image' : 'file'} size={22} />
            <div>
              <p className="upload__name">{asset.originalName}</p>
              <p className="upload__meta">{formatBytes(asset.bytes)} · SHA-256 {truncateToken(asset.sha256, 12)}</p>
            </div>
          </div>
        ) : <p className="upload__empty">No file chosen.</p>}
        <div className="upload__buttons">
          <input
            ref={inputRef} id={id} type="file" className="visually-hidden" accept={acceptAttribute(kind)} tabIndex={-1}
            disabled={disabled || upload.pending} aria-describedby={errorId} onChange={(event) => void onPick(event.target.files?.[0])}
          />
          <Button variant="secondary" size="sm" disabled={disabled || upload.pending} aria-busy={upload.pending || undefined} onClick={() => inputRef.current?.click()}>
            {upload.pending ? 'Uploading…' : asset ? 'Replace file' : 'Choose file'}
          </Button>
          {asset && onRemove && <Button variant="ghost" size="sm" disabled={disabled || upload.pending} onClick={onRemove}>Remove</Button>}
        </div>
      </div>
      <p className="ff__hint">{hint ?? rule.description}</p>
      {shownError && <p className="ff__error" id={errorId} role="alert">{shownError}</p>}
    </div>
  );
}
