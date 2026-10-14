import 'dotenv/config';
import { AdminHttpError } from '../common/admin/errors';
import { getDb } from '../common/admin/db';
import { resetPasswordByEmail } from '../modules/admin-auth/bootstrap.service';
import { prompt } from './prompt';

/**
 * npm run admin:reset-password -w nhis-api -- user@example.org
 * Lockout recovery. Email from argv[2] or ADMIN_RESET_EMAIL (else prompted); new password from ADMIN_RESET_PASSWORD
 * (else prompted twice, hidden). Revokes all of the user's sessions and clears their login throttling.
 */
async function main(): Promise<number> {
  const email = process.argv[2]?.trim() || process.env.ADMIN_RESET_EMAIL?.trim() || (await prompt('User email: '));
  let password = process.env.ADMIN_RESET_PASSWORD;
  if (!password) {
    password = await prompt('New password (min 12 characters, hidden): ', true);
    const again = await prompt('Repeat new password: ', true);
    if (again !== password) {
      console.error('Passwords do not match.');
      return 1;
    }
  }
  try {
    const result = await resetPasswordByEmail(email, password);
    console.log(`Password reset for ${result.email}; ${result.sessionsRevoked} session(s) revoked.`);
    return 0;
  } catch (error) {
    if (error instanceof AdminHttpError) console.error(`Invalid: ${[error.message, ...(error.extras.details ?? []).map((d) => `${d.field}: ${d.message}`)].join(' | ')}`);
    else console.error('Reset failed:', error instanceof Error ? error.name : 'unknown error');
    return 1;
  } finally {
    await getDb().$disconnect();
  }
}

main().then((code) => process.exit(code), (error) => {
  console.error(error instanceof Error ? error.message : 'Reset failed');
  process.exit(1);
});
