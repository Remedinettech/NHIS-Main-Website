import { adminPublicRoute } from '../../../../../../common/admin';
import { currentSession } from '../../../../../../modules/admin-auth/auth.service';

export async function GET(request: Request) {
  return adminPublicRoute(() => currentSession(request));
}
