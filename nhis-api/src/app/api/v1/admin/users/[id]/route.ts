import { withAdmin } from '../../../../../../common/admin';
import { updateUserRequest } from '../../../../../../modules/admin-users/users.service';

export const PUT = withAdmin<{ id: string }>(updateUserRequest, { capability: 'manageUsers' });
