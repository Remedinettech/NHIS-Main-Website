import { withAdmin } from '../../../../../../../common/admin';
import { resetPasswordRequest } from '../../../../../../../modules/admin-users/users.service';

export const POST = withAdmin<{ id: string }>(resetPasswordRequest, { capability: 'manageUsers' });
