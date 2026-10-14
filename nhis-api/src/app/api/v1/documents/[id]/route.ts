import { handle } from '../../../../../common/utils/http';
import { documentsService } from '../../../../../modules/documents/documents.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(() => documentsService.getById(id), request);
}
