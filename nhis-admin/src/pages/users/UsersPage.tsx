import type { AdminRole, AdminUserRecord } from '@nhis/shared-types';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { ConfirmDialog, Dialog } from '../../components/common/Dialog';
import { describeMutationError } from '../../components/common/errorMessage';
import { FilterSelect } from '../../components/common/FilterSelect';
import { PasswordField, SelectField, TextField } from '../../components/common/fields';
import { Icon } from '../../components/common/Icon';
import { PageHeader } from '../../components/common/PageHeader';
import { Pagination } from '../../components/common/Pagination';
import { SearchField } from '../../components/common/SearchField';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/StateViews';
import { TableWrap } from '../../components/common/TableWrap';
import { useToast } from '../../components/common/Toast';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useAuth } from '../../hooks/useAuth';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useMutation } from '../../hooks/useMutation';
import { createUser, listUsers, resetUserPassword, updateUser } from '../../services/admin.api';
import { ROLE_LABELS } from '../../utils/capabilities';
import { formatNumber } from '../../utils/format';
import { PASSWORD_HINT, passwordProblems, validateEmail, validateName } from '../../utils/validation';

const ROLES: readonly AdminRole[] = ['ADMIN', 'PUBLISHER', 'EDITOR'];
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
const ROLE_HELP: Record<AdminRole, string> = {
  EDITOR: 'Creates and edits drafts. Cannot publish.',
  PUBLISHER: 'Everything an editor can do, plus publish, archive and edit settings.',
  ADMIN: 'Full management, including users.',
};

type Dialogs =
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUserRecord }
  | { kind: 'password'; user: AdminUserRecord }
  | { kind: 'toggle'; user: AdminUserRecord };

function formatWhen(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';
}

function CreateUserDialog({ onClose, onDone }: { onClose: () => void; onDone: (user: AdminUserRecord) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('EDITOR');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation((body: { email: string; name: string; role: AdminRole; password: string }) => createUser(body));

  const submit = async () => {
    const next: Record<string, string> = {};
    const e = validateEmail(email); if (e) next.email = e;
    const n = validateName(name); if (n) next.name = n;
    const p = passwordProblems(password, { email, name }); if (p.length) next.password = p[0];
    setErrors(next);
    if (Object.keys(next).length) return;
    const result = await create.run({ email: email.trim(), name: name.trim(), role, password });
    if (result?.ok) onDone(result.data);
  };
  const server = create.fieldErrors;
  return (
    <Dialog open title="Add a user" onClose={onClose} busy={create.pending} onSubmit={() => void submit()}
      footer={(<><Button variant="secondary" disabled={create.pending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={create.pending} aria-busy={create.pending || undefined}>{create.pending ? 'Creating…' : 'Create user'}</Button></>)}>
      <div className="stack">
        {create.error && Object.keys(server).length === 0 && <p className="ff__error" role="alert">{describeMutationError(create.error)}</p>}
        <TextField label="Full name" required value={name} onChange={setName} maxLength={120} error={errors.name ?? server.name} autoComplete="off" />
        <TextField label="Email address" required type="email" value={email} onChange={setEmail} maxLength={254} error={errors.email ?? server.email} autoComplete="off" />
        <SelectField label="Role" required value={role} onChange={(v) => setRole(v as AdminRole)} options={ROLE_OPTIONS} hint={ROLE_HELP[role]} error={server.role} />
        <PasswordField label="Initial password" required value={password} onChange={setPassword} autoComplete="new-password" hint={`${PASSWORD_HINT} Share it securely; the person can change it after signing in.`} error={errors.password ?? server.password} />
      </div>
    </Dialog>
  );
}

function EditUserDialog({ user, isSelf, onClose, onDone }: { user: AdminUserRecord; isSelf: boolean; onClose: () => void; onDone: (user: AdminUserRecord) => void }) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<AdminRole>(user.role);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation((body: { name?: string; role?: AdminRole }) => updateUser(user.id, body));
  const submit = async () => {
    const n = validateName(name);
    setErrors(n ? { name: n } : {});
    if (n) return;
    const body: { name?: string; role?: AdminRole } = {};
    if (name.trim() !== user.name) body.name = name.trim();
    if (role !== user.role) body.role = role;
    if (Object.keys(body).length === 0) { onClose(); return; }
    const result = await save.run(body);
    if (result?.ok) onDone(result.data);
  };
  return (
    <Dialog open title="Edit user" onClose={onClose} busy={save.pending} onSubmit={() => void submit()}
      footer={(<><Button variant="secondary" disabled={save.pending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={save.pending}>{save.pending ? 'Saving…' : 'Save changes'}</Button></>)}>
      <div className="stack">
        <p className="dialog__subject">{user.email}</p>
        {save.error && <p className="ff__error" role="alert">{describeMutationError(save.error)}</p>}
        <TextField label="Full name" required value={name} onChange={setName} maxLength={120} error={errors.name ?? save.fieldErrors.name} />
        <SelectField label="Role" value={role} onChange={(v) => setRole(v as AdminRole)} options={ROLE_OPTIONS} disabled={isSelf}
          hint={isSelf ? 'You cannot change your own role. Ask another administrator.' : ROLE_HELP[role]} error={save.fieldErrors.role} />
      </div>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose, onDone }: { user: AdminUserRecord; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const reset = useMutation((newPassword: string) => resetUserPassword(user.id, { newPassword }));
  const submit = async () => {
    const problems = passwordProblems(password, { email: user.email, name: user.name });
    setError(problems[0]);
    if (problems.length) return;
    const result = await reset.run(password);
    if (result?.ok) onDone();
  };
  return (
    <Dialog open title="Reset password" onClose={onClose} busy={reset.pending} onSubmit={() => void submit()}
      footer={(<><Button variant="secondary" disabled={reset.pending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={reset.pending}>{reset.pending ? 'Resetting…' : 'Reset password'}</Button></>)}>
      <div className="stack">
        <p className="dialog__subject">{user.name} ({user.email})</p>
        <p className="editor-note">Setting a new password signs this person out everywhere.</p>
        {reset.error && <p className="ff__error" role="alert">{describeMutationError(reset.error)}</p>}
        <PasswordField label="New password" required value={password} onChange={setPassword} autoComplete="new-password" hint={PASSWORD_HINT} error={error ?? reset.fieldErrors.newPassword} />
      </div>
    </Dialog>
  );
}

export default function UsersPage() {
  useDocumentTitle('Users');
  const toast = useToast();
  const { user: me } = useAuth();
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 300);
  const [role, setRole] = useState<AdminRole | ''>('');
  const [active, setActive] = useState<'true' | 'false' | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const firstFilter = useRef(true);

  useEffect(() => {
    if (firstFilter.current) { firstFilter.current = false; return; }
    setPage(1);
  }, [q, role, active]);

  const list = useAsyncData((signal) => listUsers({ q, role, active, page, pageSize: 25 }, signal), [q, role, active, page]);
  const toggle = useMutation((user: AdminUserRecord) => updateUser(user.id, { active: !user.active }));

  const data = list.data;
  const done = (message: string) => { setDialog(null); toast.success(message); list.reload(); };

  return (
    <div className="page">
      <PageHeader title="Users" intro="People who can sign in to this administration site, and what they may do.">
        <div className="page__actions">
          <Button onClick={() => setDialog({ kind: 'create' })}><Icon name="plus" size={18} /> Add user</Button>
        </div>
      </PageHeader>

      <Card>
        <div className="filters filters--record">
          <SearchField label="Search users" value={text} onChange={setText} placeholder="Name or email" />
          <FilterSelect label="Role" value={role} onChange={(v) => setRole(v as AdminRole | '')} options={[{ value: '', label: 'All roles' }, ...ROLE_OPTIONS]} />
          <FilterSelect label="Access" value={active} onChange={(v) => setActive(v as 'true' | 'false' | '')} options={[{ value: '', label: 'Active and deactivated' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Deactivated' }]} />
        </div>
      </Card>

      {list.loading && !data && <LoadingState label="Loading users…" rows={3} />}
      {list.error && !data && <ErrorState error={list.error} title="The users could not be loaded" onRetry={list.reload} />}
      {data && (
        <section aria-label="Results" className="stack">
          <p role="status" aria-live="polite" className="text-muted result-count">{formatNumber(data.total)} {data.total === 1 ? 'user' : 'users'}{list.refreshing ? ' (updating…)' : ''}</p>
          {data.total === 0 ? <EmptyState title="No users found">Change or clear the search and filters.</EmptyState> : (
            <>
              <TableWrap label="Users">
                <table className="data-table data-table--wide">
                  <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Access</th><th scope="col">Last sign-in</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
                  <tbody>
                    {data.data.map((u) => {
                      const isSelf = u.id === me?.id;
                      return (
                        <tr key={u.id}>
                          <th scope="row"><div className="cell-stack"><span>{u.name}{isSelf ? ' (you)' : ''}</span><span className="text-muted">{u.email}</span></div></th>
                          <td>{ROLE_LABELS[u.role]}</td>
                          <td>{u.active ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Deactivated</Badge>}</td>
                          <td className="nowrap">{formatWhen(u.lastLoginAt)}</td>
                          <td className="record-actions-cell">
                            <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'edit', user: u })}>Edit<span className="visually-hidden"> {u.name}</span></Button>
                            <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'password', user: u })}>Reset password<span className="visually-hidden"> for {u.name}</span></Button>
                            {!isSelf && <Button size="sm" variant="ghost" onClick={() => { toggle.reset(); setDialog({ kind: 'toggle', user: u }); }}>{u.active ? 'Deactivate' : 'Reactivate'}<span className="visually-hidden"> {u.name}</span></Button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
              <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
            </>
          )}
        </section>
      )}

      {dialog?.kind === 'create' && <CreateUserDialog onClose={() => setDialog(null)} onDone={(u) => done(`${u.name} was added as ${ROLE_LABELS[u.role].toLowerCase()}.`)} />}
      {dialog?.kind === 'edit' && <EditUserDialog user={dialog.user} isSelf={dialog.user.id === me?.id} onClose={() => setDialog(null)} onDone={(u) => done(`${u.name} was updated.`)} />}
      {dialog?.kind === 'password' && <ResetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} onDone={() => done(`The password for ${dialog.user.name} was reset.`)} />}
      {dialog?.kind === 'toggle' && (
        <ConfirmDialog
          open
          title={dialog.user.active ? 'Deactivate this user?' : 'Reactivate this user?'}
          subject={`${dialog.user.name} (${dialog.user.email})`}
          confirmLabel={dialog.user.active ? 'Deactivate' : 'Reactivate'}
          busyLabel="Saving…"
          destructive={dialog.user.active}
          busy={toggle.pending}
          error={toggle.error ? describeMutationError(toggle.error) : undefined}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const result = await toggle.run(dialog.user);
            if (result?.ok) done(`${dialog.user.name} was ${dialog.user.active ? 'deactivated' : 'reactivated'}.`);
          }}
        >
          {dialog.user.active
            ? 'They are signed out straight away and cannot sign in until an administrator reactivates them. The last active administrator cannot be deactivated.'
            : 'They can sign in again with their existing password.'}
        </ConfirmDialog>
      )}
    </div>
  );
}
