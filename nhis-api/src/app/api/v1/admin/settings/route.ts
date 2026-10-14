import { withAdmin } from '../../../../../common/admin';
import { getSettingsResponse, saveSettingsRequest } from '../../../../../modules/admin-settings/settings.service';

export const GET = withAdmin(() => getSettingsResponse());
export const PUT = withAdmin(saveSettingsRequest, { capability: 'editSettings' });
