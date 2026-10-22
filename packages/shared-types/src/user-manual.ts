import type { UserManualContent } from './site-content.types';

export const MANUAL_PDF = 'user-manual/NHIS_User_Manual.pdf';
export const MANUAL_VIDEO_FILES = [
  'user-manual/Preauth_Submission_Narrated.mp4',
  'user-manual/Preauth_Approval_Narrated.mp4',
  'user-manual/Claims_Submission_Narrated.mp4',
  'user-manual/Claims_Approved_Narrated.mp4',
] as const;
export const DEFAULT_USER_MANUAL: UserManualContent = {
  title: { en: 'User Manual', ta: 'பயனர் கையேடு' },
  intro: { en: 'Download the manual or watch the workflow videos.', ta: '' },
  manual: { title: { en: 'NHIS User Manual', ta: '' }, buttonLabel: { en: 'Download manual (PDF)', ta: '' }, visible: true, source: { type: 'builtIn', path: MANUAL_PDF } },
  videos: ['Pre-authorisation submission', 'Pre-authorisation approval', 'Claims submission', 'Claims approved'].map((en, index) => ({
    id: ['preauth-submission', 'preauth-approval', 'claims-submission', 'claims-approved'][index], title: { en, ta: '' },
    description: { en: '', ta: '' }, visible: true, source: { type: 'builtIn', path: MANUAL_VIDEO_FILES[index] },
  })),
};

/** Only known providers are embedded. Other HTTPS addresses remain ordinary external links. */
export function manualEmbedUrl(address: string): string | null {
  try {
    const url = new URL(address); if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) {
      const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.pathname.startsWith('/embed/') ? url.pathname.slice(7) : url.searchParams.get('v');
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (url.hostname === 'drive.google.com') {
      const id = /^\/file\/d\/([A-Za-z0-9_-]{8,})/.exec(url.pathname)?.[1] ?? url.searchParams.get('id');
      return id && /^[A-Za-z0-9_-]{8,100}$/.test(id) ? `https://drive.google.com/file/d/${id}/preview` : null;
    }
  } catch { /* not an embeddable provider URL */ }
  return null;
}
