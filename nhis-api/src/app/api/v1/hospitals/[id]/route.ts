import { NotFoundError } from '../../../../../common/utils/errors';
import { handle } from '../../../../../common/utils/http';
import { hospitalsService } from '../../../../../modules/hospitals/hospitals.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    // Unknown (or over-long) ids are simply not found, as before.
    if (id.length > 100) throw new NotFoundError();
    const hospital = await hospitalsService.findById(id);
    if (!hospital) throw new NotFoundError();
    return { data: hospital, source: 'snapshot' };
  }, request);
}
