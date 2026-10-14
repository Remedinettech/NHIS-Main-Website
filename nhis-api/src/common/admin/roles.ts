import type { AdminRole } from '@nhis/shared-types';
import { forbidden } from './errors';

/** Capability table from docs/admin-backend-design.md (Roles). */
export const CAPABILITIES = {
  viewContent: ['EDITOR', 'PUBLISHER', 'ADMIN'],
  viewAudit: ['EDITOR', 'PUBLISHER', 'ADMIN'],
  editContent: ['EDITOR', 'PUBLISHER', 'ADMIN'], // create, save draft, discard draft, upload files
  publish: ['PUBLISHER', 'ADMIN'], // publish, unpublish, archive, restore, hard-delete eligible drafts
  editSettings: ['PUBLISHER', 'ADMIN'],
  manageUsers: ['ADMIN'],
} as const satisfies Record<string, readonly AdminRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function hasCapability(role: AdminRole, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly AdminRole[]).includes(role);
}

/** Accepts a role or anything with a `user.role` (the withAdmin context). Throws 403 FORBIDDEN. */
export function requireCapability(subject: AdminRole | { user: { role: AdminRole } }, capability: Capability): void {
  const role = typeof subject === 'string' ? subject : subject.user.role;
  if (!hasCapability(role, capability)) throw forbidden();
}
