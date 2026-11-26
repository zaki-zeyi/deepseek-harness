import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'inputs.local.json');
const inputs=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
/** Resolve an explicitly configured external template or the local default. */
export function inputPath(name,fallback){return path.resolve(root,inputs[name]??fallback);}
