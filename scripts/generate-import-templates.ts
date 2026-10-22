import fs from 'node:fs/promises';
import path from 'node:path';
import { modules, template } from '../nhis-api/src/modules/imports/workbook';
async function main() {
const dir = path.resolve('nhis-admin/public/import-templates');
await fs.mkdir(dir, { recursive: true });
for (const module of modules) await fs.writeFile(path.join(dir, `${module}.xlsx`), await template(module));
console.log('Generated five product templates. Contacts templates with directory columns are downloaded from Admin.');

}
main().catch(e => { console.error(e); process.exitCode = 1; });
