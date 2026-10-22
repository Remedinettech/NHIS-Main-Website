import { DEFAULT_USER_MANUAL, MANUAL_VIDEO_FILES, type ManualMediaSource, type ManualVideo } from '@nhis/shared-types';
import { ASSET_ID_PATTERN, adminAssetPath, makeSiteId } from './siteForm';

/*
 * Pure helpers of the User Manual editor (no React, no `import.meta`, so they run in the node tests): which kinds of file
 * source a row offers, what a row starts with when a kind is chosen, and the address the editor may preview.
 */

export type ManualSourceType = ManualMediaSource['type'];

/** The most videos the shared validator accepts. */
export const MANUAL_VIDEO_LIMIT = 40;

/** A new video at the end of the list: no title yet and an empty web address, which the form asks for. The id is unique among `takenIds`. */
export function newManualVideo(takenIds: Iterable<string>): ManualVideo {
  return { id: makeSiteId('video', takenIds), title: { en: '', ta: '' }, description: { en: '', ta: '' }, visible: true, source: { type: 'external', url: '' } };
}

/**
 * The kinds of source a row offers. The manual PDF is a built-in file or an uploaded PDF; a video may also be a web address
 * (YouTube, Google Drive or any https page), which the shared validator refuses for the PDF.
 */
export function manualSourceOptions(video: boolean): Array<{ value: ManualSourceType; label: string }> {
  return [
    { value: 'builtIn', label: 'Built-in file' },
    { value: 'upload', label: video ? 'Uploaded MP4' : 'Uploaded PDF' },
    ...(video ? [{ value: 'external' as const, label: 'YouTube, Google Drive or web address' }] : []),
  ];
}

/** The built-in file of a video: the one of the shipped video with the same id, else the first shipped video. */
export function builtInVideoSource(videoId: string | undefined): ManualMediaSource {
  const shipped = DEFAULT_USER_MANUAL.videos.find((entry) => entry.id === videoId) ?? DEFAULT_USER_MANUAL.videos[0];
  return shipped ? shipped.source : { type: 'builtIn', path: MANUAL_VIDEO_FILES[0] };
}

/** The built-in file of a row: the shipped manual PDF, or the shipped file of the video with this id. */
export function builtInSource(video: boolean, videoId?: string): ManualMediaSource {
  return video ? builtInVideoSource(videoId) : DEFAULT_USER_MANUAL.manual.source;
}

/**
 * What a row holds right after a kind is chosen: the built-in file, or an empty upload or web address that the form then asks
 * for. The PDF has no web address, so that kind falls back to the built-in file.
 */
export function startingSource(type: ManualSourceType, video: boolean, videoId?: string): ManualMediaSource {
  if (type === 'upload') return { type: 'upload', assetId: '' };
  if (type === 'external' && video) return { type: 'external', url: '' };
  return builtInSource(video, videoId);
}

/**
 * The address the editor may show a preview of, or null while there is nothing to show. A file of the website is read from the
 * public site (`clientBase`, for example "/TNNHIS/"). An uploaded file is private until it is published, so it is read through
 * the admin session; the answer is an API path that the caller resolves with resolveApiUrl. An empty or half-typed asset ID, and
 * a web address (which opens elsewhere), have no preview: asking for one only produces a pointless request.
 */
export function manualPreviewAddress(source: ManualMediaSource, clientBase: string): string | null {
  switch (source.type) {
    case 'builtIn':
      return source.path.trim() === '' ? null : `${clientBase.replace(/\/+$/, '')}/${source.path.replace(/^\/+/, '')}`;
    case 'upload': {
      const assetId = source.assetId.trim();
      return ASSET_ID_PATTERN.test(assetId) ? adminAssetPath(assetId) : null;
    }
    case 'external':
      return null;
  }
}
