const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {unzipSync} = require('fflate');
const {files:buildFiles} = require('./build.cjs');

for (const browser of ['chrome', 'firefox']) {
  const root = path.resolve('dist', browser);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const files = [...manifest.content_scripts.flatMap(script => script.js),
    ...(manifest.background.scripts || [manifest.background.service_worker]),
    manifest.options_ui.page, ...Object.values(manifest.icons)];
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file.replace(/^\//, ''))), `${browser}: missing ${file}`);
  assert.equal(manifest.name, 'Open Bilingual Translate');
  assert.equal(manifest.version, require('../package.json').version);
  for (const name of ['LICENSE','UPSTREAM.md','PRIVACY','BUILD.json']) assert.ok(fs.existsSync(path.join(root,name)), `${browser}: missing provenance ${name}`);
  const archive = unzipSync(fs.readFileSync(`dist/${browser}.zip`));
  assert.deepEqual(Object.keys(archive).sort(), buildFiles(root).sort(), `${browser}: ZIP file set differs from installation directory`);
  for (const [name,bytes] of Object.entries(archive)) assert.ok(Buffer.from(bytes).equals(fs.readFileSync(path.join(root,name))), `${browser}: stale ZIP entry ${name}`);
  function check(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) check(file);
      else {
        assert.ok(!/patreon|donat|coinpayments|^eth\./i.test(entry.name), `${browser}: legacy funding asset ${entry.name}`);
        if (/\.(js|json|html|css|map)$/.test(entry.name)) {
          const text = fs.readFileSync(file, 'utf8');
          assert.ok(!/patreon\.com|paypal\.com|coinpayments|t\.me\/\+|0x[a-f0-9]{40}|openDonationPage|btnDonate|lblMakeDonation/i.test(text), `${browser}: legacy funding/contact content in ${file}`);
          if (entry.name.endsWith('.js')) new vm.Script(text, { filename: file });
          if (entry.name.endsWith('.json')) JSON.parse(text);
          if (entry.name.endsWith('.html')) for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
            const value = match[1];
            if (/^(?:[a-z]+:|#|\/\/)/i.test(value)) continue;
            const target = value.split(/[?#]/)[0];
            assert.ok(fs.existsSync(target.startsWith('/') ? path.join(root,target) : path.resolve(path.dirname(file),target)), `${browser}: missing UI resource ${value}`);
          }
        }
      }
    }
  }
  check(root);
  assert.ok(fs.statSync(`dist/${browser}.zip`).size > 1000);
  console.log(`${browser}: manifest/UI, syntax, JSON, licenses, funding cleanup and ZIP contents OK`);
}
