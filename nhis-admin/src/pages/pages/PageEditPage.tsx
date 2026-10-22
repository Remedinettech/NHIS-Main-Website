import { appendGrievanceSections, missingGrievanceSections, updateGrievanceBeneficiaries, type AdminPage, type AdminPageValues } from '@nhis/shared-types';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { useDocumentOptions } from '../../components/records/InlineNodesEditor';
import { PageContentEditor } from '../../components/records/PageContentEditor';
import { imageBlockProblems } from '../../components/records/PageImageBlock';
import { PagePreview } from '../../components/records/PagePreview';
import { RecordEditor } from '../../components/records/RecordEditor';
import { PAGE_NAMES } from './PagesListPage';

const EMPTY: AdminPageValues = { en: null, ta: null };

function validate(v: AdminPageValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.en && !v.ta) errors.values = 'A page needs content in at least one language.';
  for (const l of ['en', 'ta'] as const) {
    const c = v[l];
    if (!c) continue;
    if (!c.title.trim()) errors[`${l}.title`] = 'Enter the page title.';
    c.sections.forEach((s, i) => {
      s.blocks.forEach((b, j) => {
        if (b.type === 'image') Object.assign(errors, imageBlockProblems(b, `${l}.sections.${i}.blocks.${j}`));
        if (b.type === 'documentLink') {
          if (!b.documentId) errors[`${l}.sections.${i}.blocks.${j}.documentId`] = 'Choose a document.';
          if (!b.text.trim()) errors[`${l}.sections.${i}.blocks.${j}.text`] = 'Enter the button text.';
        }
      });
    });
  }
  return errors;
}

function Preview({ values }: { values: AdminPageValues }) {
  const [shown, setShown] = useState(false);
  const [lang, setLang] = useState<'en' | 'ta'>('en');
  const content = values[lang];
  return (
    <Card title="Preview" description="Shows the content as currently entered, including edits that are not saved yet.">
      <div className="stack">
        <div className="node-row__tools">
          <Button variant="secondary" size="sm" onClick={() => setShown((v) => !v)} aria-expanded={shown}>{shown ? 'Hide preview' : 'Show preview'}</Button>
          {shown && (['en', 'ta'] as const).map((l) => (
            <Button key={l} size="sm" variant={l === lang ? 'primary' : 'ghost'} aria-pressed={l === lang} onClick={() => setLang(l)}>{l === 'en' ? 'English' : 'Tamil'}</Button>
          ))}
        </div>
        {shown && (content ? <PagePreview content={content} lang={lang} /> : <p className="editor-note">There is no {lang === 'en' ? 'English' : 'Tamil'} version.</p>)}
      </div>
    </Card>
  );
}

export default function PageEditPage() {
  const { slug } = useParams();
  const documents = useDocumentOptions();
  return (
    <RecordEditor<AdminPageValues, AdminPage>
      module="pages"
      entityType="page"
      routeId={slug}
      noun="page"
      newValues={EMPTY}
      listPath="/pages"
      editPath={(r) => `/pages/${encodeURIComponent(r.slug)}`}
      recordName={(v) => v.en?.title ?? v.ta?.title ?? (slug ? PAGE_NAMES[slug] ?? slug : 'Page')}
      validate={validate}
      exclude={['unpublish', 'archive', 'restore', 'delete']}
    >
      {({ values, setValues, errors, readOnly }) => (
        <>
          {slug === 'grievances' && <Card title="Current grievance contacts" description="Replace the English beneficiary sections with the HITPA, Medi Assist and Vidal sections exactly as the live website shows them (checked on 19 October 2026, wording kept as published). Other sections and Tamil wording are preserved. This button changes the form only; save a draft and preview before publishing.">
            <Button variant="secondary" disabled={readOnly || !values.en} onClick={() => setValues(current => updateGrievanceBeneficiaries(current))}>Use current English grievance contacts</Button>
          </Card>}
          {slug === 'grievances' && <Card title="NHIS 2026 officer & escalation tables" description="The public Grievances page already shows the NHIS 2026 nodal officer and escalation tables from the site itself, exactly as on the live site. Add them here only if you want to edit them as page text: once this page is published with them, the built-in copy is hidden. Nothing is saved or published by this button.">
            <Button variant="secondary" disabled={readOnly || missingGrievanceSections(values) === 0} onClick={() => setValues((current) => appendGrievanceSections(current))}>
              {missingGrievanceSections(values) ? 'Add supplied officer tables' : 'Supplied tables are already present'}
            </Button>
          </Card>}
          <Card title={slug ? PAGE_NAMES[slug] ?? slug : 'Page'} description="English and Tamil are edited separately. Keep the wording exactly as approved.">
            <PageContentEditor values={values} onChange={(next) => setValues(next)} documents={documents} errors={errors} disabled={readOnly} />
          </Card>
          <Preview values={values} />
        </>
      )}
    </RecordEditor>
  );
}
