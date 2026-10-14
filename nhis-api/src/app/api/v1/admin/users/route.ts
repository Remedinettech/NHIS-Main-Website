import { withAdmin } from '../../../../../common/admin';
import { createUserRequest, listUsersRequest } from '../../../../../modules/admin-users/users.service';

export const GET = withAdmin(listUsersRequest, { capability: 'manageUsers' });
export const POST = withAdmin(createUserRequest, { capability: 'manageUsers' });
