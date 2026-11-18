/** Prepare plugins after Electron readiness and before the desktop starts its host. */
export function patchWindowsStartup(source){
  const original='app.whenReady().then(main)';
  const earlier='app.whenReady().then(async () => { await prepareSuite(); await main(); })';
  const prepared='app.whenReady().then(async () => { const finish = await prepareSuite(); try { await main(); } finally { finish?.(); } })';
  if(!source.includes(original)&&!source.includes(earlier)&&!source.includes(prepared))throw Error('Unsupported desktop startup entry');
  source=source.replace('import "./seed-profile.js";\n','').replace('import {prepareSuite} from "./seed-profile.js";\n','');
  return 'import {prepareSuite} from "./seed-profile.js";\n'+source.replace(original,prepared).replace(earlier,prepared);
}
