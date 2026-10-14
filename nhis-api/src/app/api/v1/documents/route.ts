import { handle } from '../../../../common/utils/http';
import { documentsService } from '../../../../modules/documents/documents.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(() => documentsService.list(new URL(request.url).searchParams), request);
}
