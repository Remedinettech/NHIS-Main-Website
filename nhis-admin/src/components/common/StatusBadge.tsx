import type { PublicationStatus } from '@nhis/shared-types';
import { Badge, type BadgeTone } from './Badge';

const LABELS: Record<PublicationStatus, { text: string; tone: BadgeTone }> = {
  DRAFT: { text: 'Draft', tone: 'neutral' },
  PUBLISHED: { text: 'Published', tone: 'success' },
  ARCHIVED: { text: 'Archived', tone: 'warning' },
};

/** Status is always colour plus text. A published record with pending edits also shows the "Unpublished changes" chip. */
export function StatusBadge({ status, hasDraft }: { status: PublicationStatus; hasDraft?: boolean }) {
  const { text, tone } = LABELS[status];
  return (
    <span className="status-badges">
      <Badge tone={tone}>{text}</Badge>
      {hasDraft && status !== 'ARCHIVED' && <Badge tone="info">Unpublished changes</Badge>}
    </span>
  );
}
