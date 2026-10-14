import { withAdmin } from '../../../../../../common/admin';
import { changePassword } from '../../../../../../modules/admin-auth/auth.service';

export const POST = withAdmin(changePassword);
