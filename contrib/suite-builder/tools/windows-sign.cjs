const path = require('node:path');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const crypto = require('node:crypto');

// electron-builder calls this for the app, installer and embedded uninstaller.
exports.default = async function sign(configuration) {
  await new Promise((resolve, reject) => {
    const child = spawn('pwsh', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, '../automation/windows-sign.ps1'), '-Mode', 'SignGenerated', '-Target', configuration.path], {
      windowsHide: true, stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Windows signing failed (${code})`)));
  });
  if (!process.env.DSH_SIGNING_RECEIPTS) throw new Error('Missing per-build signing receipt path');
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(configuration.path)) hash.update(chunk);
  fs.appendFileSync(process.env.DSH_SIGNING_RECEIPTS, JSON.stringify({file: configuration.path, sha256: hash.digest('hex')}) + '\n');
};
