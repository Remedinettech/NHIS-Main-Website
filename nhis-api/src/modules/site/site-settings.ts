import type { HelplineSetting, PortalSetting } from '@nhis/shared-types';

/** Keys of the `SiteSetting` table. Values use the same field names as the admin settings form. */
export const SETTING_KEYS = { scheme: 'scheme', helplines: 'helplines', portals: 'portals' } as const;

/** `SiteSetting.value` for key `scheme`. */
export interface SchemeSettingValue {
  schemeNameEn: string;
  schemeNameTa: string;
  coverageStatementEn: string;
  coverageStatementTa: string;
  availability: string;
}

/** `SiteSetting.value` for key `helplines` is `HelplineSetting[]`; for key `portals` it is `PortalSetting[]`. */
export type HelplinesSettingValue = HelplineSetting[];
export type PortalsSettingValue = PortalSetting[];
