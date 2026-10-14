import { handle } from '../../../../common/utils/http';
import { statsService } from '../../../../modules/stats/stats.service';

export const dynamic = 'force-dynamic';

export async function GET(request?: Request) {
  return handle(() => statsService.getStats(), request);
}
