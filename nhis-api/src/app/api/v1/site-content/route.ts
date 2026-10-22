import { handle } from '../../../../common/utils/http';
import { siteContentService } from '../../../../modules/site-content/site-content.service';

export const dynamic = 'force-dynamic';

/** GET /api/v1/site-content: the six site-content documents as published (built-in content for what was never published). */
export async function GET(request?: Request) {
  return handle(() => siteContentService.getSiteContent(), request);
}
