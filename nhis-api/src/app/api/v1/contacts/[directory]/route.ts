import { handle } from '../../../../../common/utils/http';
import { contactsService } from '../../../../../modules/contacts/contacts.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ directory: string }> }) {
  const { directory } = await params;
  return handle(() => contactsService.getDirectory(directory), request);
}
