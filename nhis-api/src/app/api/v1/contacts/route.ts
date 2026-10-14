import { handle } from '../../../../common/utils/http';
import { contactsService } from '../../../../modules/contacts/contacts.service';

export const dynamic = 'force-dynamic';

export async function GET(request?: Request) {
  return handle(() => contactsService.index(), request);
}
