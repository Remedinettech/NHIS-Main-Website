import type { AdminSettings, HelplineSetting, PortalSetting } from '@nhis/shared-types';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { ConflictBanner } from '../../components/common/ConflictBanner';
import { describeMutationError } from '../../components/common/errorMessage';
import { BilingualFields } from '../../components/common/BilingualFields';
import { TextField, UrlField } from '../../components/common/fields';
import { FormActions } from '../../components/common/FormActions';
import { PageHeader } from '../../components/common/PageHeader';
import { ErrorState, LoadingState } from '../../components/common/StateViews';
import { Banner, useToast } from '../../components/common/Toast';
import { UnsavedChangesGuard } from '../../components/common/UnsavedChangesGuard';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useCan } from '../../hooks/useAuth';
import { useDirtyForm } from '../../hooks/useDirtyForm';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useMutation } from '../../hooks/useMutation';
import { getSettings, saveSettings } from '../../services/admin.api';
import { telHrefFor, validateSettings } from '../../utils/validation';

const EMPTY: AdminSettings = {
  schemeNameEn: '', schemeNameTa: '', coverageStatementEn: '', coverageStatementTa: '', availability: '', helplines: [], portals: [],
};

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const toast = useToast();
  const canEdit = useCan('settings.edit');
  const loaded = useAsyncData((signal) => getSettings(signal), []);
  const [version, setVersion] = useState(0);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const form = useDirtyForm<AdminSettings>(EMPTY);
  const { markClean, values, setField } = form;

  useEffect(() => {
    if (loaded.data) {
      markClean(loaded.data.data);
      setVersion(loaded.data.version);
    }
  }, [loaded.data, markClean]);

  const save = useMutation((next: AdminSettings, expectedVersion: number) => saveSettings({ values: next, expectedVersion }));

  const submit = useCallback(async () => {
    const problems = validateSettings(values);
    setClientErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const normalised: AdminSettings = {
      ...values,
      helplines: values.helplines.map((h) => ({ ...h, telHref: telHrefFor(h.number) })),
    };
    const result = await save.run(normalised, version);
    if (result?.ok) {
      markClean(result.data.data);
      setVersion(result.data.version);
      toast.success('Settings were saved and are live on the website.');
    }
  }, [markClean, save, toast, values, version]);

  const errors = { ...save.fieldErrors, ...clientErrors };

  if (loaded.loading && !loaded.data) return <div className="page"><LoadingState label="Loading settings…" rows={3} /></div>;
  if (loaded.error && !loaded.data) return <div className="page"><ErrorState error={loaded.error} title="The settings could not be loaded" onRetry={loaded.reload} /></div>;

  const setHelpline = (i: number, patch: Partial<HelplineSetting>) => setField('helplines', values.helplines.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const setPortal = (i: number, patch: Partial<PortalSetting>) => setField('portals', values.portals.map((p, j) => (p === values.portals[i] ? { ...p, ...patch } : p)));
  const readOnly = !canEdit;

  return (
    <div className="page">
      <UnsavedChangesGuard when={form.dirty && !save.pending} />
      <PageHeader title="Settings" intro="Scheme name, helplines and portal links used across the public website. Saving applies the change immediately." />
      {readOnly && <Banner tone="info">Your role can view the settings but not change them.</Banner>}
      {save.conflict && <ConflictBanner onReload={() => { save.reset(); loaded.reload(); }} busy={loaded.loading} />}
      {save.error && !save.conflict && Object.keys(save.fieldErrors).length === 0 && <Banner tone="error" title="The settings were not saved">{describeMutationError(save.error)}</Banner>}
      {Object.keys(errors).length > 0 && <Banner tone="error" title="Check the highlighted fields">Some settings need attention before they can be saved.</Banner>}

      <form className="editor-form" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <Card title="Scheme" description="Shown in the website header, the home page and browser titles.">
          <div className="editor-section">
            <BilingualFields legend="Scheme name" required english={values.schemeNameEn} tamil={values.schemeNameTa} maxLength={400} disabled={readOnly}
              onEnglishChange={(x) => setField('schemeNameEn', x)} onTamilChange={(x) => setField('schemeNameTa', x)} englishError={errors.schemeNameEn} tamilError={errors.schemeNameTa} />
            <BilingualFields legend="Coverage statement" required multiline rows={3} english={values.coverageStatementEn} tamil={values.coverageStatementTa} maxLength={2000} disabled={readOnly}
              onEnglishChange={(x) => setField('coverageStatementEn', x)} onTamilChange={(x) => setField('coverageStatementTa', x)} englishError={errors.coverageStatementEn} tamilError={errors.coverageStatementTa} />
            <TextField label="Helpline availability" required value={values.availability} onChange={(x) => setField('availability', x)} maxLength={200} disabled={readOnly} error={errors.availability} hint="For example 24/7." />
          </div>
        </Card>

        <Card title="Helplines" description="Telephone numbers shown in the website header, footer and Contact page.">
          <div className="editor-section">
            {errors.helplines && <p className="ff__error" role="alert">{errors.helplines}</p>}
            {values.helplines.map((h, i) => (
              <div className="node-row" key={h.id}>
                <BilingualFields legend={`Helpline ${i + 1} label`} required english={h.labelEn} tamil={h.labelTa} maxLength={240} disabled={readOnly}
                  onEnglishChange={(x) => setHelpline(i, { labelEn: x })} onTamilChange={(x) => setHelpline(i, { labelTa: x })}
                  englishError={errors[`helplines.${i}.labelEn`]} tamilError={errors[`helplines.${i}.labelTa`]} />
                <TextField label="Number" required value={h.number} onChange={(x) => setHelpline(i, { number: x })} maxLength={30} inputMode="tel" disabled={readOnly} error={errors[`helplines.${i}.number`]}
                  hint="As shown, for example 1800-233-5666. The call link is created from it." />
                {!readOnly && <div className="node-row__tools"><Button size="sm" variant="ghost" onClick={() => setField('helplines', values.helplines.filter((_, j) => j !== i))}>Remove helpline {i + 1}</Button></div>}
              </div>
            ))}
            {!readOnly && (
              <div><Button variant="secondary" size="sm" onClick={() => setField('helplines', [...values.helplines, { id: `helpline-${values.helplines.length + 1}-${Date.now().toString(36)}`, labelEn: '', labelTa: '', number: '', telHref: '' }])}>Add a helpline</Button></div>
            )}
          </div>
        </Card>

        <Card title="Portal links" description="Where the Login menu, claim tracking and partner links lead. Only secure (https) addresses are accepted.">
          <div className="editor-section">
            {errors.portals && <p className="ff__error" role="alert">{errors.portals}</p>}
            {values.portals.map((p, i) => (
              <div className="node-row" key={p.id}>
                <BilingualFields legend={`Link ${i + 1} label`} required english={p.label} tamil={p.labelTa} maxLength={240} disabled={readOnly}
                  onEnglishChange={(x) => setPortal(i, { label: x })} onTamilChange={(x) => setPortal(i, { labelTa: x })}
                  englishError={errors[`portals.${i}.label`]} tamilError={errors[`portals.${i}.labelTa`]} />
                <UrlField label="Address" required value={p.href} onChange={(x) => setPortal(i, { href: x })} maxLength={500} disabled={readOnly} error={errors[`portals.${i}.href`]} />
              </div>
            ))}
          </div>
        </Card>

        {!readOnly && (
          <div className="editor-footer">
            <FormActions saveLabel="Save settings" busy={save.pending} saveDisabled={!form.dirty} onCancel={() => { form.reset(); setClientErrors({}); save.reset(); }} cancelLabel="Discard edits" />
          </div>
        )}
      </form>
    </div>
  );
}
