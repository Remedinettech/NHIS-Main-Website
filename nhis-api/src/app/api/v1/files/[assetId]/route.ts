import { errorResponse } from '../../../../../common/utils/errors';
import { filesService } from '../../../../../modules/files/files.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  try {
    return await filesService.serve(assetId, request);
  } catch (error) {
    return errorResponse(error);
  }
}
