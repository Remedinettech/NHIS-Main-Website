import { adminPublicRoute } from '../../../../../../common/admin';
import { login } from '../../../../../../modules/admin-auth/auth.service';

export async function POST(request: Request) {
  return adminPublicRoute(() => login(request));
}
