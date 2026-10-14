import type { AdminRole, PublicationStatus } from '@nhis/shared-types';

/**
 * What each role may do (docs/admin-backend-design.md, "Roles"). These checks only decide what the interface shows;
 * the server enforces the same rules on every request.
 */
export type Capability = 'content.write' | 'content.publish' | 'settings.edit' | 'users.manage' | 'audit.view' | 'view';

const BY_ROLE: Record<AdminRole, ReadonlySet<Capability>> = {
  EDITOR: new Set<Capability>(['view', 'audit.view', 'content.write']),
  PUBLISHER: new Set<Capability>(['view', 'audit.view', 'content.write', 'content.publish', 'settings.edit']),
  ADMIN: new Set<Capability>(['view', 'audit.view', 'content.write', 'content.publish', 'settings.edit', 'users.manage']),
};

export function can(role: AdminRole | undefined, capability: Capability): boolean {
  return role ? BY_ROLE[role].has(capability) : false;
}

export const ROLE_LABELS: Record<AdminRole, string> = { ADMIN: 'Administrator', PUBLISHER: 'Publisher', EDITOR: 'Editor' };

/** Capability needed to open a route. Routes not listed are open to every signed-in member of staff. */
const ROUTE_REQUIREMENTS: ReadonlyArray<{ prefix: string; capability: Capability }> = [
  { prefix: '/users', capability: 'users.manage' },
];

export function canAccessPath(role: AdminRole | undefined, pathname: string): boolean {
  if (!role) return false;
  const rule = ROUTE_REQUIREMENTS.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return rule ? can(role, rule.capability) : true;
}

export type RecordAction = 'edit' | 'publish' | 'unpublish' | 'archive' | 'restore' | 'discard-draft' | 'delete';

export interface RecordState {
  status: PublicationStatus;
  hasDraft: boolean;
  publishedAt: string | null;
}

/** Actions the menu offers for a record: allowed for the role AND valid for the record's state. */
export function allowedRecordActions(role: AdminRole | undefined, state: RecordState): RecordAction[] {
  const out: RecordAction[] = [];
  if (!role || !can(role, 'content.write')) return out;
  const archived = state.status === 'ARCHIVED';
  if (!archived) out.push('edit');
  const publisher = can(role, 'content.publish');
  if (publisher && (state.status === 'DRAFT' || (state.status === 'PUBLISHED' && state.hasDraft))) out.push('publish');
  if (publisher && state.status === 'PUBLISHED') out.push('unpublish');
  if (state.status === 'PUBLISHED' && state.hasDraft) out.push('discard-draft');
  if (publisher && !archived) out.push('archive');
  if (publisher && archived) out.push('restore');
  if (publisher && state.status === 'DRAFT' && state.publishedAt === null) out.push('delete');
  return out;
}
