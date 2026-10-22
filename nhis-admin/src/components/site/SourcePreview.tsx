/*
 * What the User Manual editor shows of the file a row points to. No CSS import and nothing that reads `import.meta`, so the node
 * tests can render it (the style `manual-preview` comes from site.css, which the editor loads).
 */

interface SourcePreviewProps {
  /** Address to show, already resolved for the browser (see resolveApiUrl), or null while the row has no file. */
  url: string | null;
  /** A video row (a player) or the manual PDF (a link). */
  video: boolean;
}

/**
 * A player for a video, a link for the PDF. Nothing at all while there is no file: a row switched to "Uploaded MP4" used to draw an
 * empty player whose `src` was the file route without an id, which made the browser ask the server for ".../admin/files/".
 */
export function SourcePreview({ url, video }: SourcePreviewProps) {
  if (url === null || url.trim() === '') return null;
  if (video) {
    return <video className="manual-preview" controls preload="metadata" src={url}>Your browser cannot play this video.</video>;
  }
  return <a href={url} target="_blank" rel="noopener noreferrer">Preview the PDF<span className="visually-hidden"> (opens in a new tab)</span></a>;
}
