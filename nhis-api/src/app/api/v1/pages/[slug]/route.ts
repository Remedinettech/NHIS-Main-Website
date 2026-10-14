import { handle } from '../../../../../common/utils/http';
import { pagesService } from '../../../../../modules/pages/pages.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(() => pagesService.getPage(slug), request);
}
