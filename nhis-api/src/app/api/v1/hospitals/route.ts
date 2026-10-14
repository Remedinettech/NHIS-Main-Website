import { handle } from '../../../../common/utils/http';
import { hospitalsService } from '../../../../modules/hospitals/hospitals.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(() => hospitalsService.search(new URL(request.url).searchParams), request);
}
