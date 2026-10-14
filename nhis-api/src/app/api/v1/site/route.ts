import { handle } from '../../../../common/utils/http';
import { siteService } from '../../../../modules/site/site.service';

export const dynamic = 'force-dynamic';

export async function GET(request?: Request) {
  return handle(() => siteService.getSettings(), request);
}
