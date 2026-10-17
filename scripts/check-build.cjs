const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

for (const browser of ['chrome', 'firefox']) {
  const root = path.resolve('dist', browser);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const files = [...manifest.content_scripts.flatMap(script => script.js),
    ...(manifest.background.scripts || [manifest.background.service_worker]),
    manifest.options_ui.page, ...Object.values(manifest.icons)];
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file.replace(/^\//, ''))), `${browser}: missing ${file}`);
  assert.equal(manifest.name, 'Open Bilingual Translate');
  assert.equal(manifest.version, require('../package.json').version);
  function check(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) check(file);
      else if (entry.name.endsWith('.js')) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
    }
  }
  check(root);
  assert.ok(fs.statSync(`dist/${browser}.zip`).size > 1000);
  console.log(`${browser}: manifest references, JavaScript syntax and archive OK`);
}
