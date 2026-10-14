import { healthService } from '../../../../modules/health/health.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { body, status } = await healthService.check();
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
