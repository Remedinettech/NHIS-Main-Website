import 'dotenv/config';
import { AdminHttpError } from '../common/admin/errors';
import { getDb } from '../common/admin/db';
import { BootstrapRefusedError, bootstrapAdmin } from '../modules/admin-auth/bootstrap.service';
import { prompt } from './prompt';

/**
 * npm run admin:bootstrap -w nhis-api
 * Reads ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD (optional ADMIN_BOOTSTRAP_NAME) from the environment,
 * otherwise prompts (password hidden). Never prints the password. Exits non-zero on refusal or invalid input.
 */
async function main(): Promise<number> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim() || (await prompt('Administrator email: '));
  const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || undefined;
  let password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!password) {
    password = await prompt('Password (min 12 characters, hidden): ', true);
    const again = await prompt('Repeat password: ', true);
    if (again !== password) {
      console.error('Passwords do not match.');
      return 1;
    }
  }
  try {
    const user = await bootstrapAdmin({ email, password, name });
    console.log(`Created administrator ${user.email}. Sign in at the admin site, then change the password if it was shared.`);
    return 0;
  } catch (error) {
    if (error instanceof BootstrapRefusedError) console.error(`Refused: ${error.message}`);
    else if (error instanceof AdminHttpError) console.error(`Invalid: ${[error.message, ...(error.extras.details ?? []).map((d) => `${d.field}: ${d.message}`)].join(' | ')}`);
    else console.error('Bootstrap failed:', error instanceof Error ? error.name : 'unknown error');
    return 1;
  } finally {
    await getDb().$disconnect();
  }
}

main().then((code) => process.exit(code), (error) => {
  console.error(error instanceof Error ? error.message : 'Bootstrap failed');
  process.exit(1);
});
