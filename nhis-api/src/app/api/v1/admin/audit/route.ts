import { withAdmin } from '../../../../../common/admin';
import { listAudit } from '../../../../../modules/admin-audit/audit.service';

export const GET = withAdmin((ctx) => listAudit(ctx), { capability: 'viewAudit' });
