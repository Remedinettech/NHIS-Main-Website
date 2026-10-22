import { DEFAULT_USER_MANUAL, MANUAL_VIDEO_FILES, SITE_CONTENT_LIMITS, isSafeHttpsUrl, manualEmbedUrl, type AdminAsset, type ManualMediaSource, type ManualVideo, type UserManualContent } from '@nhis/shared-types';
import { useState } from 'react';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { FileUploadField } from '../../components/common/FileUploadField';
import { BilingualInput } from '../../components/site/BilingualInput';
import { ReorderableList } from '../../components/site/ReorderableList';
import { SiteContentEditor, type SiteEditorContext } from '../../components/site/SiteContentEditor';
import { useSiteForm } from '../../components/site/SiteFormContext';
import { SiteSelect } from '../../components/site/SiteSelect';
import { SiteTextField } from '../../components/site/SiteTextField';
import { SourcePreview } from '../../components/site/SourcePreview';
import { VisibilityToggle } from '../../components/site/VisibilityToggle';
import {
  MANUAL_VIDEO_LIMIT, builtInSource, manualPreviewAddress, manualSourceOptions, newManualVideo, startingSource, type ManualSourceType,
} from '../../components/site/manualSource';
import { ASSET_ID_PATTERN, type FieldErrors } from '../../components/site/siteForm';
import { CLIENT_BASE_URL } from '../../config/siteContent';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { resolveApiUrl } from '../../utils/urls';

const L = SITE_CONTENT_LIMITS;
/** How long a typed asset ID must stand still before the editor asks the server for a preview of it. */
const PREVIEW_DELAY_MS = 600;
/** The error of the asset ID is shown once, by the upload field, so the ID box is given no errors of its own. */
const NO_ERRORS: FieldErrors = {};
/** The videos that come with the website, named by their shipped titles. */
const BUILT_IN_VIDEO_OPTIONS = MANUAL_VIDEO_FILES.map((file, index) => ({ value: file, label: DEFAULT_USER_MANUAL.videos[index]?.title.en ?? file }));

type ManualFormProps = Pick<SiteEditorContext<'manual'>, 'values' | 'setField' | 'setValues'>;

/* ------------------------------------------------------------------ one file source (the manual PDF or one video) */

interface SourceEditorProps {
  /** Path of the source in the document ("manual.source", "videos.2.source"): its errors are read from here. */
  path: string;
  source: ManualMediaSource;
  /** A video row (MP4, YouTube, Google Drive or web address) or the manual PDF. */
  video: boolean;
  /** Id of the video, so that "Reset" gives back its own shipped file. */
  videoId?: string;
  /** Names the row for screen readers ("video 2", "the manual PDF"). */
  subject: string;
  onChange: (next: ManualMediaSource) => void;
}

/** A shipped file: which one is chosen from the files that come with the website. */
function BuiltInChoice({ path, source, video, onChange }: Pick<SourceEditorProps, 'path' | 'video' | 'onChange'> & { source: Extract<ManualMediaSource, { type: 'builtIn' }> }) {
  if (!video) return <p>The manual PDF that comes with the website.</p>;
  return <SiteSelect label="Built-in video" path={`${path}.path`} value={source.path} options={BUILT_IN_VIDEO_OPTIONS} onChange={(next) => onChange({ type: 'builtIn', path: next })} />;
}

/** An uploaded file: choose a file to upload, or give the ID of one that was uploaded before. */
function UploadChoice({ path, source, video, uploaded, onUploaded, onChange }: Pick<SourceEditorProps, 'path' | 'video' | 'onChange'> & {
  source: Extract<ManualMediaSource, { type: 'upload' }>;
  uploaded: AdminAsset | null;
  onUploaded: (asset: AdminAsset) => void;
}) {
  const { readOnly, errors } = useSiteForm();
  return (
    <>
      <FileUploadField
        label={video ? 'MP4 video' : 'Manual PDF'} kind={video ? 'video' : 'document'} asset={uploaded} disabled={readOnly}
        error={errors[`${path}.assetId`]} onUploaded={onUploaded}
      />
      <SiteTextField
        label="Uploaded file (asset ID)" path={`${path}.assetId`} value={source.assetId} limit={64} errors={NO_ERRORS}
        hint="Shown under an uploaded file. Type an ID to use a file that was uploaded before."
        onChange={(assetId) => onChange({ type: 'upload', assetId })}
      />
    </>
  );
}

/** A web address: YouTube and Google Drive play inside the page, any other https address opens in a new tab. */
function ExternalChoice({ path, source, onChange }: Pick<SourceEditorProps, 'path' | 'onChange'> & { source: Extract<ManualMediaSource, { type: 'external' }> }) {
  const embeds = manualEmbedUrl(source.url) !== null;
  return (
    <>
      <SiteTextField label="Web address" path={`${path}.url`} type="url" value={source.url} limit={L.url} onChange={(url) => onChange({ type: 'external', url })} />
      <p>{embeds ? 'This provider plays inside the page. Drive files must allow anyone with the link to view.' : 'This address opens in a new tab.'}</p>
      {isSafeHttpsUrl(source.url) && (
        <a href={source.url} target="_blank" rel="noopener noreferrer">Open the address<span className="visually-hidden"> in a new tab</span></a>
      )}
    </>
  );
}

function SourceEditor({ path, source, video, videoId, subject, onChange }: SourceEditorProps) {
  const { readOnly } = useSiteForm();
  // The file uploaded in this session: its name and size are shown while the row still points at it.
  const [uploaded, setUploaded] = useState<AdminAsset | null>(null);
  const typedId = source.type === 'upload' ? source.assetId.trim() : '';
  const settledId = useDebouncedValue(typedId, PREVIEW_DELAY_MS);
  // A file that was just uploaded is shown at once; an ID that is being typed only after the typing stops.
  const settled = source.type !== 'upload' || uploaded?.id === source.assetId || (ASSET_ID_PATTERN.test(typedId) && settledId === typedId);
  const address = settled ? manualPreviewAddress(source, CLIENT_BASE_URL) : null;
  const shipped = builtInSource(video, videoId);
  const isShipped = JSON.stringify(source) === JSON.stringify(shipped);

  return (
    <div className="editor-section">
      <SiteSelect
        label="File source" path={`${path}.type`} value={source.type} options={manualSourceOptions(video)}
        onChange={(type) => onChange(startingSource(type as ManualSourceType, video, videoId))}
      />
      {source.type === 'builtIn' && <BuiltInChoice path={path} source={source} video={video} onChange={onChange} />}
      {source.type === 'upload' && (
        <UploadChoice
          path={path} source={source} video={video} uploaded={uploaded?.id === source.assetId ? uploaded : null} onChange={onChange}
          onUploaded={(asset) => { setUploaded(asset); onChange({ type: 'upload', assetId: asset.id }); }}
        />
      )}
      {source.type === 'external' && <ExternalChoice path={path} source={source} onChange={onChange} />}
      {/* Nothing is drawn until the row has a file to show (see SourcePreview). */}
      <SourcePreview url={address === null ? null : resolveApiUrl(address)} video={video} />
      <div>
        <Button variant="secondary" size="sm" disabled={readOnly || isShipped} onClick={() => onChange(shipped)}>
          Reset to built-in file<span className="visually-hidden"> for {subject}</span>
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the cards */

function PageTextCard({ values, setField }: Pick<ManualFormProps, 'values' | 'setField'>) {
  return (
    <Card title="Page text">
      <div className="editor-section">
        <BilingualInput label="Page title" path="title" value={values.title} limit={L.heading} required onChange={(next) => setField('title', next)} />
        <BilingualInput label="Introduction" path="intro" value={values.intro} limit={L.text} multiline onChange={(next) => setField('intro', next)} />
        <p>Review the draft Tamil page and menu label with a Tamil reader. Video titles remain English until you supply translations.</p>
      </div>
    </Card>
  );
}

/** The manual PDF. Every change is applied to the latest values, so an upload that ends later cannot undo what was typed meanwhile. */
function ManualPdfCard({ manual, setValues }: { manual: UserManualContent['manual']; setValues: ManualFormProps['setValues'] }) {
  const change = (patch: Partial<UserManualContent['manual']>) => setValues((current) => ({ ...current, manual: { ...current.manual, ...patch } }));
  return (
    <Card title="Manual PDF">
      <div className="editor-section">
        <VisibilityToggle label="Show the manual" checked={manual.visible} onChange={(visible) => change({ visible })} />
        <BilingualInput label="Manual title" path="manual.title" value={manual.title} limit={L.heading} required onChange={(title) => change({ title })} />
        <BilingualInput label="Download button label" path="manual.buttonLabel" value={manual.buttonLabel} limit={L.label} required onChange={(buttonLabel) => change({ buttonLabel })} />
        <SourceEditor path="manual.source" source={manual.source} video={false} subject="the manual PDF" onChange={(source) => change({ source })} />
      </div>
    </Card>
  );
}

function VideosCard({ videos, setField }: { videos: ManualVideo[]; setField: ManualFormProps['setField'] }) {
  return (
    <Card title="Videos">
      <ReorderableList<ManualVideo>
        label="Videos" itemNoun="video" path="videos" items={videos} max={MANUAL_VIDEO_LIMIT} collapsible
        onChange={(next) => setField('videos', next)} getId={(video) => video.id}
        createItem={() => newManualVideo(videos.map((video) => video.id))}
        rowTitle={(video) => video.title.en}
        isVisible={(video) => video.visible} setVisible={(video, visible) => ({ ...video, visible })}
        renderItem={(video, row) => (
          <>
            <BilingualInput label="Video title" path={`${row.path}.title`} value={video.title} limit={L.heading} required onChange={(title) => row.update((current) => ({ ...current, title }))} />
            <BilingualInput label="Description" path={`${row.path}.description`} value={video.description} limit={L.text} multiline onChange={(description) => row.update((current) => ({ ...current, description }))} />
            <SourceEditor
              path={`${row.path}.source`} source={video.source} video videoId={video.id} subject={`video ${row.index + 1}`}
              onChange={(source) => row.update((current) => ({ ...current, source }))}
            />
          </>
        )}
      />
    </Card>
  );
}

/** Editor of the User Manual document: the page text, the manual PDF and the videos (uploads, YouTube, Google Drive or web addresses). */
export default function UserManualPage() {
  return (
    <SiteContentEditor contentKey="manual">
      {({ values, setField, setValues }) => (
        <>
          <PageTextCard values={values} setField={setField} />
          <ManualPdfCard manual={values.manual} setValues={setValues} />
          <VideosCard videos={values.videos} setField={setField} />
        </>
      )}
    </SiteContentEditor>
  );
}
