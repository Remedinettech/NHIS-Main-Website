import { SITE_CONTENT_LIMITS, type LinkItem } from '@nhis/shared-types';
import type { LinkKind } from '../../utils/siteContentLinks';
import { BilingualInput } from './BilingualInput';
import { LinkTargetEditor } from './LinkTargetEditor';
import { VisibilityToggle } from './VisibilityToggle';
import type { FieldErrors } from './siteForm';

export interface LinkItemEditorProps {
  /** Path of the link in the document ("loginMenu.forgotPassword", "linkGroups.0.links.2"). */
  path: string;
  value: LinkItem;
  onChange: (next: LinkItem) => void;
  /** Legend of the label pair. Default "Link text". */
  labelLegend?: string;
  /** Kinds the target may have (default all five). */
  kinds?: readonly LinkKind[];
  /** Adds a "Shown on the website" switch. Leave it off inside a ReorderableList that already has one in the row. */
  showVisible?: boolean;
  disabled?: boolean;
  errors?: FieldErrors;
}

/**
 * A link with a bilingual label and a target (LinkItem: id, label, target, visible). The id is never edited. For a document
 * link the label may contain {title}, which the website replaces with the document's own title.
 */
export function LinkItemEditor({ path, value, onChange, labelLegend = 'Link text', kinds, showVisible, disabled, errors }: LinkItemEditorProps) {
  return (
    <div className="stack">
      <BilingualInput
        label={labelLegend} path={`${path}.label`} required limit={SITE_CONTENT_LIMITS.label} value={value.label} errors={errors} disabled={disabled}
        onChange={(label) => onChange({ ...value, label })}
        hint={value.target.type === 'document' ? 'You can write {title}: the website replaces it with the title of the document.' : undefined}
      />
      <LinkTargetEditor path={`${path}.target`} value={value.target} kinds={kinds} errors={errors} disabled={disabled} onChange={(target) => onChange({ ...value, target })} />
      {showVisible && <VisibilityToggle checked={value.visible} disabled={disabled} onChange={(visible) => onChange({ ...value, visible })} />}
    </div>
  );
}
