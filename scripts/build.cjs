// Node 22 build: modern browser JavaScript is shipped unchanged. No lifecycle scripts.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {zipSync} = require('fflate');
const project = path.resolve(__dirname, '..');
const source = path.join(project, 'src');
const version = require('../package.json').version;
const background = ['lib/languages.js','lib/config.js','lib/platformInfo.js','lib/util.js',
  'background/translationCache.js','background/aiProviders.js','background/translationService.js',
  'background/readingService.js','background/dictionaryService.js','background/chrome_background.js'];

function files(root, prefix = '') {
  return fs.readdirSync(root, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name, 'en')).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('Build inputs must not contain symbolic links');
    const name = prefix + entry.name;
    return entry.isDirectory() ? files(path.join(root, entry.name), name + '/') : [name];
  });
}
function build(browser) {
  if (!['chrome','firefox'].includes(browser)) throw new Error('Use chrome or firefox');
  const output = path.join(project, 'dist', browser);
  // Fixed, validated browser names keep cleanup inside the build directory.
  fs.rmSync(output, {recursive:true, force:true});
  fs.mkdirSync(output, {recursive:true});
  for (const name of files(source)) {
    if (name === 'chrome_manifest.json' || name === 'manifest.json') continue;
    if (browser === 'chrome' && name.startsWith('background/')) continue;
    const target = path.join(output, name);
    fs.mkdirSync(path.dirname(target), {recursive:true});
    if (name.endsWith('.html')) fs.writeFileSync(target, fs.readFileSync(path.join(source,name),'utf8').replaceAll('__IMMERSIVE_TRANSLATE_VERSION__', version));
    else fs.copyFileSync(path.join(source, name), target);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(source, browser === 'chrome' ? 'chrome_manifest.json' : 'manifest.json'), 'utf8'));
  if (manifest.version !== version) throw new Error('Manifest/package version mismatch');
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest,null,2) + '\n');
  if (browser === 'chrome') {
    fs.mkdirSync(path.join(output, 'background'), {recursive:true});
    fs.writeFileSync(path.join(output, 'background/background-entry.js'), background.map(name=>fs.readFileSync(path.join(source,name),'utf8')).join('\n;\n'));
  }
  for (const name of ['LICENSE','UPSTREAM.md','PRIVACY']) fs.copyFileSync(path.join(project,name),path.join(output,name));
  let commit = null;
  try { commit = execFileSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch (_) { /* Source ZIP without .git. */ }
  fs.writeFileSync(path.join(output,'BUILD.json'), JSON.stringify({version,commit,browser},null,2)+'\n');
  const entries = Object.fromEntries(files(output).map(name=>[name, fs.readFileSync(path.join(output,name))]));
  fs.writeFileSync(path.join(project,'dist',browser+'.zip'), zipSync(entries,{level:6,mtime:new Date('2000-01-01T00:00:00Z')}));
  console.log(`${browser}: ${Object.keys(entries).length} files -> dist/${browser}.zip`);
}
if (require.main === module) for (const browser of process.argv[2] ? [process.argv[2]] : ['firefox','chrome']) build(browser);
module.exports = {build, files};
