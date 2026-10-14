import { handle } from '../../../../common/utils/http';
import { galleryService } from '../../../../modules/gallery/gallery.service';

export const dynamic = 'force-dynamic';

export async function GET(request?: Request) {
  return handle(() => galleryService.getGallery(), request);
}
