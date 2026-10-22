import type { AdminContactDirectory } from '@nhis/shared-types';
import { useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { describeMutationError } from '../../components/common/errorMessage';
import { SelectField } from '../../components/common/fields';
import { PageHeader } from '../../components/common/PageHeader';
import { Banner, useToast } from '../../components/common/Toast';
import { useCan } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../services/client';
import {
  confirmImport, importTemplatePath, listImports, previewImport, processImport, type ImportJob, type ImportPreview,
} from '../../services/imports.api';
import { resolveApiUrl } from '../../utils/urls';
import {
  IMPORT_MODULES, IMPORT_MODULE_LABELS, PREVIEW_KINDS, PREVIEW_KIND_LABELS, buildCsv, checkImportFile, countPreviewKinds, describeJob, errorReportRows,
  isFinished, knownDirectory, madeProgress, parseImportModule, resultReportRows, unfinishedJob, type ImportModule,
} from './importHelpers';
import './imports.css';

/** The server answered "not finished" without processing any row: stop instead of asking again and again. */
class ImportStalledError extends Error {}

/** A sentence for the person: the server's own wording for failures of a request, a plain sentence for anything else. */
function describeFailure(error: unknown, somethingChanged = false): string {
  if (error instanceof ImportStalledError) return error.message;
  return describeMutationError(error instanceof Error ? error : new Error('Request failed'), { somethingChanged });
}

const MODE_OPTIONS = [
  { value: 'create', label: 'Create new records' },
  { value: 'update', label: 'Update existing records' },
];

const MODULE_OPTIONS = IMPORT_MODULES.map((value) => ({ value, label: IMPORT_MODULE_LABELS[value] }));

/** Saves text as a CSV file. A byte order mark makes Excel read the Tamil and other non-ASCII text correctly. */
function downloadCsv(name: string, rows: ReadonlyArray<readonly unknown[]>) {
  const url = URL.createObjectURL(new Blob(['﻿', buildCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers start the download after the click returns: release the file a little later.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const formatTime = (iso: string): string => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** Which step failed, so that the message says what did and did not happen. */
type Step = 'check' | 'import' | 'history';

/**
 * Excel import: choose a module and a workbook, check it (nothing is changed), review every row, then confirm. Confirmed rows are
 * saved as drafts, one batch at a time; a job that stopped can be resumed (also after a reload) and rows that were already
 * processed are not repeated. Nothing is published by an import.
 */
export default function ImportPage() {
  useDocumentTitle('Import Excel');
  const toast = useToast();
  const canWrite = useCan('content.write');
  const [params] = useSearchParams();
  const [module, setModule] = useState<ImportModule>(() => parseImportModule(params.get('module')));
  const [directoryId, setDirectoryId] = useState(params.get('directory') ?? '');
  const [directories, setDirectories] = useState<Array<{ value: string; label: string }>>([]);
  const [mode, setMode] = useState('create');
  const [file, setFile] = useState<File>();
  const [fileProblem, setFileProblem] = useState<string>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [job, setJob] = useState<ImportJob>();
  const [history, setHistory] = useState<ImportJob[]>([]);
  const [reloadHistory, setReloadHistory] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ step: Step; message: string }>();
  // Spoken by screen readers when a step ends: a card that appears on the page is not announced by itself.
  const [announcement, setAnnouncement] = useState('');
  const running = useRef(false);
  const stopped = useRef(false);
  const fileId = useId();

  // A page that is left must not keep sending batches; the job stays recorded and can be resumed.
  useEffect(() => {
    stopped.current = false;
    return () => { stopped.current = true; };
  }, []);

  useEffect(() => {
    if (!canWrite) return undefined;
    const controller = new AbortController();
    adminApi.getJson<{ data: AdminContactDirectory[] }>('/contacts/directories', { signal: controller.signal })
      .then((result) => setDirectories(result.data.map((directory) => ({ value: directory.id, label: directory.labelEn || directory.id }))))
      .catch(() => { /* the directory choice is then empty and says so */ });
    return () => controller.abort();
  }, [canWrite]);

  // The list of the module that was left must not stay on screen (with its Resume button) under the name of the new one.
  useEffect(() => { setHistory([]); }, [module]);

  useEffect(() => {
    if (!canWrite) return undefined;
    const controller = new AbortController();
    listImports(module, controller.signal)
      .then(setHistory)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setProblem({ step: 'history', message: describeFailure(error) });
      });
    return () => controller.abort();
  }, [module, canWrite, reloadHistory]);

  const needsDirectory = module === 'contacts';
  // Only a directory the select can show counts as chosen (see knownDirectory).
  const chosenDirectory = knownDirectory(directoryId, directories);
  const missingDirectory = needsDirectory && chosenDirectory === '';
  const unfinished = unfinishedJob(history);

  const run = async (step: Step, action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setProblem(undefined);
    try {
      await action();
    } catch (error) {
      // Batches that ran before an import stopped are saved, so its message must not say that nothing was changed.
      setProblem({ step, message: describeFailure(error, step === 'import') });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const chooseFile = (chosen: File | undefined) => {
    setPreview(undefined);
    setProblem(undefined);
    setFile(chosen);
    setFileProblem(chosen ? checkImportFile(chosen) ?? undefined : undefined);
  };

  const check = () => run('check', async () => {
    if (!file || fileProblem) return;
    const form = new FormData();
    form.set('file', file);
    form.set('module', module);
    form.set('mode', mode);
    if (needsDirectory) form.set('directoryId', chosenDirectory);
    setJob(undefined);
    const checked = await previewImport(form);
    setPreview(checked);
    const found = countPreviewKinds(checked.rows);
    setAnnouncement(checked.valid
      ? `The workbook was checked: ${checked.rows.length} rows, no problems. Review the rows, then confirm.`
      : `The workbook was checked: ${found.invalid + found.duplicate} of ${checked.rows.length} rows have problems. Nothing can be imported yet.`);
  });

  /** Runs batches until the job is finished, the page is left, or a batch makes no progress. */
  const processAll = async (start: ImportJob) => {
    let current = start;
    setJob(current);
    while (!isFinished(current)) {
      if (stopped.current) return;
      const next = await processImport(current.id);
      setJob(next);
      if (!madeProgress(current, next)) throw new ImportStalledError('The server did not process any more rows. Nothing more was imported; choose Resume to try again.');
      current = next;
    }
    setReloadHistory((count) => count + 1);
    const counts = current.counts ?? {};
    const finished = `Import finished: ${counts.created ?? 0} created, ${counts.updated ?? 0} updated, ${counts.failed ?? 0} failed.`;
    setAnnouncement(finished);
    toast.success(`${finished} The records are drafts until you publish them.`);
  };

  const confirm = () => run('import', async () => {
    if (!preview?.token) return;
    await processAll(await confirmImport(preview.token));
  });

  const resume = (target: ImportJob) => run('import', () => processAll(target));

  if (!canWrite) {
    return (
      <div className="page">
        <PageHeader title="Import Excel" />
        <Banner tone="info" title="Your role cannot import content">Importing creates and changes records, which needs the Editor, Publisher or Administrator role.</Banner>
      </div>
    );
  }

  const counts = preview ? countPreviewKinds(preview.rows) : undefined;
  const templateHref = resolveApiUrl(`/api/v1${importTemplatePath(module, chosenDirectory)}`);

  return (
    <div className="page">
      <PageHeader
        title="Import Excel"
        intro="Check a workbook first: nothing is changed until you confirm. Imported records are saved as drafts, so nothing appears on the website until it is published."
      />
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>

      {unfinished && !job && (
        <Banner
          tone="warning" title="An import is not finished"
          action={<Button size="sm" variant="secondary" disabled={busy} onClick={() => void resume(unfinished)}>Resume this import</Button>}
        >
          {IMPORT_MODULE_LABELS[parseImportModule(unfinished.module)]}, started {formatTime(unfinished.createdAt)}. {describeJob(unfinished)} Rows that were already processed are not repeated.
        </Banner>
      )}

      <Card title="1. Choose and check the workbook" description="Download the template, fill in the Records sheet, then check it here.">
        <fieldset className="import-form" disabled={busy}>
          <legend className="visually-hidden">Workbook to check</legend>
          <SelectField
            label="What to import" value={module} options={MODULE_OPTIONS}
            onChange={(value) => { setModule(parseImportModule(value)); setPreview(undefined); setJob(undefined); setProblem(undefined); }}
          />
          {needsDirectory && (
            <SelectField
              label="Directory" required value={chosenDirectory} options={directories} placeholder={directories.length === 0 ? 'No directory could be loaded' : 'Choose a directory'}
              hint="The template has the columns of the directory you choose here."
              onChange={(value) => { setDirectoryId(value); setPreview(undefined); }}
            />
          )}
          <SelectField
            label="What the rows do" value={mode} options={MODE_OPTIONS} onChange={(value) => { setMode(value); setPreview(undefined); }}
            hint="Updates match the ID column exactly. A blank cell keeps the existing value; write #CLEAR to empty an optional field. Records that are not in the workbook are never deleted."
          />
          <p className="editor-note">
            Upload documents and logos first, then write their asset IDs in the workbook (shown under an uploaded file). Local file paths and web addresses are not read. The Instructions sheet of the template lists the columns and the allowed values.
          </p>
          <div>
            {missingDirectory
              ? <Button variant="secondary" disabled>Download the template (choose a directory first)</Button>
              : <a className="btn btn--secondary" href={templateHref} download>Download the template<span className="visually-hidden"> for {IMPORT_MODULE_LABELS[module]}</span></a>}
          </div>
          <div className={`ff${fileProblem ? ' ff--invalid' : ''}`}>
            <label htmlFor={fileId} className="ff__label">Excel workbook (.xlsx)</label>
            <input
              id={fileId} type="file" className="ff__control import-form__file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-invalid={fileProblem ? true : undefined} aria-describedby={`${fileId}-hint${fileProblem ? ` ${fileId}-error` : ''}`}
              onChange={(event) => chooseFile(event.target.files?.[0])}
              // Choosing the file again after it was corrected on disk does not fire "change" when the name is the same, and the
              // browser refuses to read a file that changed since it was chosen. Opening the chooser clears the choice, so a
              // new choice (also of the same file) is always seen, and the page never keeps a file it can no longer read.
              onClick={(event) => { event.currentTarget.value = ''; chooseFile(undefined); }}
            />
            <p className="ff__hint" id={`${fileId}-hint`}>One workbook at a time, up to 5 MB. Only the Records sheet is read; formulas, macros and links are not accepted.</p>
            {fileProblem && <p className="ff__error" id={`${fileId}-error`} role="alert">{fileProblem}</p>}
          </div>
          <div>
            <Button onClick={() => void check()} disabled={!file || Boolean(fileProblem) || missingDirectory} aria-busy={busy || undefined}>
              {busy && !job ? 'Checking…' : 'Check the workbook'}
            </Button>
          </div>
        </fieldset>
      </Card>

      {problem && (
        <Banner tone="error" title={problem.step === 'check' ? 'The workbook could not be checked' : problem.step === 'import' ? 'The import stopped' : 'The earlier imports could not be loaded'}>
          <p>{problem.message}</p>
          {problem.step === 'check' && <p>Nothing was imported.</p>}
          {problem.step === 'import' && <p>Rows that were processed before it stopped are recorded and are not repeated. Choose Resume to continue.</p>}
        </Banner>
      )}

      {preview && counts && (
        <Card title="2. Review the rows" description={`${preview.rows.length} rows were read. Checking changed nothing. At most ${preview.limits.rows} rows and ${preview.limits.bytes.toLocaleString('en-GB')} bytes are accepted.`}>
          <div className="stack">
            <p role="status" className="import-summary">
              {PREVIEW_KINDS.map((kind) => `${PREVIEW_KIND_LABELS[kind]}: ${counts[kind]}`).join('. ')}.
            </p>
            {PREVIEW_KINDS.filter((kind) => counts[kind] > 0).map((kind) => (
              <details key={kind} open={kind === 'invalid' || kind === 'duplicate'} className="import-rows">
                <summary>{PREVIEW_KIND_LABELS[kind]}: {counts[kind]}</summary>
                {preview.rows.filter((row) => row.kind === kind).map((row) => (
                  <article key={row.row} className="import-row">
                    <h3>Row {row.row}: {row.id}</h3>
                    {row.errors.length > 0 && (
                      <ul className="import-row__errors">
                        {row.errors.map((error, index) => <li key={index}><strong>{error.field}:</strong> {error.message}</li>)}
                      </ul>
                    )}
                    <dl className="import-row__values">
                      {Object.entries((row.values ?? {}) as Record<string, unknown>).map(([name, value]) => (
                        <div key={name}><dt>{name}</dt><dd>{typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')}</dd></div>
                      ))}
                    </dl>
                  </article>
                ))}
              </details>
            ))}
            <div className="form-actions">
              {counts.invalid + counts.duplicate > 0 && (
                <Button variant="secondary" onClick={() => downloadCsv('import-problems.csv', errorReportRows(preview.rows))}>Download the list of problems</Button>
              )}
              <Button disabled={busy || !preview.valid || !preview.token || job !== undefined} onClick={() => void confirm()}>Confirm and save as drafts</Button>
            </div>
            {!preview.valid
              ? <p className="editor-note">Some rows have problems, so nothing can be imported yet. Fix them in the workbook and check it again.</p>
              : <p className="editor-note">This check stays valid for 30 minutes. If it expires, check the workbook again.</p>}
          </div>
        </Card>
      )}

      {job && (
        <Card title="3. Import progress">
          <div className="stack">
            <p role="status" aria-live="polite">{describeJob(job)}</p>
            <progress className="import-progress" value={job.cursor} max={Math.max(job.total, 1)} aria-label="Rows processed">{job.cursor} of {job.total}</progress>
            <div className="form-actions">
              {!isFinished(job) && <Button disabled={busy} onClick={() => void resume(job)}>{busy ? 'Importing…' : 'Resume the import'}</Button>}
              <Button variant="secondary" onClick={() => downloadCsv('import-results.csv', resultReportRows(job))}>Download the results</Button>
            </div>
            {job.results.some((result) => result.state === 'failed') && (
              <section aria-label="Rows that failed">
                <h3>Rows that failed</h3>
                <ul className="import-row__errors">
                  {job.results.filter((result) => result.state === 'failed').map((result) => <li key={result.row}><strong>Row {result.row} ({result.id}):</strong> {result.message}</li>)}
                </ul>
                <p className="editor-note">Fix these rows in a new workbook; rows that were saved are not changed again.</p>
              </section>
            )}
          </div>
        </Card>
      )}

      <Card title={`Earlier imports of ${IMPORT_MODULE_LABELS[module]}`} description="Your latest 20 imports of this kind.">
        {history.length === 0 ? <p className="editor-note">No imports yet.</p> : (
          <ul className="import-history">
            {history.map((entry) => (
              <li key={entry.id}>
                <p>
                  <strong>{formatTime(entry.createdAt)}</strong>, {entry.mode === 'create' ? 'create' : 'update'}. {describeJob(entry)}
                </p>
                <div className="form-actions">
                  <Button size="sm" variant="ghost" onClick={() => { setPreview(undefined); setJob(entry); setProblem(undefined); }}>View results<span className="visually-hidden"> of the import of {formatTime(entry.createdAt)}</span></Button>
                  {!isFinished(entry) && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void resume(entry)}>Resume<span className="visually-hidden"> the import of {formatTime(entry.createdAt)}</span></Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
