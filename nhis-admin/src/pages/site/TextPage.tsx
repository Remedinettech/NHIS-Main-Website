import { EDITABLE_TEXT_CATALOG, type EditableTextEntry } from '@nhis/shared-types';
import { useMemo, useState } from 'react';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { TextField } from '../../components/common/fields';
import { BilingualInput } from '../../components/site/BilingualInput';
import { SiteContentEditor, type SiteEditorContext } from '../../components/site/SiteContentEditor';
import {
  countOverrides, groupTextCatalog, isEmptyOverride, overrideOf, placeholdersOf, setOverride, unknownOverrideKeys, withoutOverrides,
} from '../../components/site/siteEdit';

type TextFormProps = Pick<SiteEditorContext<'text'>, 'values' | 'setField'>;

/** The built-in wording and what must stay in it, shown under the field. */
function BuiltInWording({ entry }: { entry: EditableTextEntry }) {
  const placeholders = placeholdersOf(`${entry.defaults.en} ${entry.defaults.ta}`);
  return (
    <>
      <span className="text-entry__default">Built-in wording: {entry.defaults.en}</span>
      {entry.defaults.ta && <span className="text-entry__default" lang="ta">{entry.defaults.ta}</span>}
      <span className="text-entry__default">Leave a language empty to keep its built-in wording.</span>
      {placeholders.length > 0 && (
        <span className="text-entry__default">Keep {placeholders.map((name) => `{${name}}`).join(', ')} exactly as written: the website fills it in.</span>
      )}
    </>
  );
}

/** The cards of the interface-text editor: every text of the catalog, grouped by page, with its built-in wording. */
export function TextForm({ values, setField }: TextFormProps) {
  const [filter, setFilter] = useState('');
  const overrides = values.overrides;
  const groups = useMemo(() => groupTextCatalog(EDITABLE_TEXT_CATALOG, filter), [filter]);
  const shown = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const unknown = unknownOverrideKeys(overrides);
  const changed = countOverrides(overrides);

  return (
    <>
      <Card title="Interface text" description="Headings, introductions and labels of the public pages. Where a field is empty the website keeps its built-in wording; Tamil falls back to English.">
        <div className="editor-section">
          <p className="text-entry__summary" role="status" aria-live="polite">
            {changed === 0 ? 'No text is changed yet.' : `${changed} ${changed === 1 ? 'text is' : 'texts are'} changed.`}
            {filter.trim() !== '' && ` Showing ${shown} of ${EDITABLE_TEXT_CATALOG.length} texts.`}
          </p>
          {/* The search filters as you type. Enter must not submit the editor form, which would save the draft. (Enter that ends a
              Tamil or other IME composition is left alone: stopping it would swallow the text being composed.) */}
          <div onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault(); }}>
            <TextField label="Find a text" value={filter} onChange={setFilter} maxLength={100} hint="Search by page, name or wording. Texts that are hidden by the search keep what you typed." />
          </div>
        </div>
      </Card>

      {unknown.length > 0 && (
        <Card title="Texts that can no longer be changed" description="These entries are not part of the editable texts of this version of the website. The server rejects them, so remove them.">
          <ul className="text-entry__unknown">
            {unknown.map((key) => <li key={key}><code className="ff__code">{key}</code></li>)}
          </ul>
          <Button variant="secondary" size="sm" onClick={() => setField('overrides', withoutOverrides(overrides, unknown))}>Remove {unknown.length === 1 ? 'this entry' : 'these entries'}</Button>
        </Card>
      )}

      {groups.length === 0 && <Card><p className="editor-note">No text matches “{filter.trim()}”.</p></Card>}

      {groups.map((group) => (
        <Card key={group.group} title={group.group}>
          <div className="editor-section">
            {group.entries.map((entry) => {
              const value = overrideOf(overrides, entry.key);
              return (
                <div className="text-entry" key={entry.key}>
                  <BilingualInput
                    label={entry.label} path={`overrides.${entry.key}`} limit={entry.maxLength} multiline={entry.multiline} value={value}
                    hint={<BuiltInWording entry={entry} />}
                    onChange={(next) => setField('overrides', setOverride(overrides, entry.key, next))}
                  />
                  {!isEmptyOverride(value) && (
                    <Button variant="ghost" size="sm" onClick={() => setField('overrides', setOverride(overrides, entry.key, { en: '', ta: '' }))}>
                      Use the built-in wording<span className="visually-hidden"> for {group.group}: {entry.label}</span>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </>
  );
}

/** Editor of the interface-text document. */
export default function TextPage() {
  return (
    <SiteContentEditor contentKey="text">
      {({ values, setField }) => <TextForm values={values} setField={setField} />}
    </SiteContentEditor>
  );
}
