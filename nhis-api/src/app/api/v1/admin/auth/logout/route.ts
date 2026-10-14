import { withAdmin } from '../../../../../../common/admin';
import { logout } from '../../../../../../modules/admin-auth/auth.service';

export const POST = withAdmin(logout);
