// Bundles the whole app into one HTML file for the Artifact viewer:  node tools/build-artifact.mjs [folder]
// Writes dist/engage.html, dist/survey.html, dist/maru.html, dist/missions.html, dist/tonight.html, dist/xeno.html, dist/contact.html and dist/warp.html: styles, fonts, scripts, star data and the Milky Way all inline, with no document wrapper
// (the viewer adds its own). The site itself still runs from the repo as-is; this is only for the playable copy.
// With a folder named, the eight files go there instead of dist/ (test/artifact.test.mjs builds into a temporary one).
// The source is patched by exact strings, and each page's modules are listed by hand, so the build stops with a
// message when a string it patches is no longer there, or a module imports one that isn't on its page's list:
// either would leave a copy that opens to nothing.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ? resolve(process.argv[2]) : join(root, 'dist');
const read = (f, enc = 'utf8') => readFile(join(root, f), enc);
const b64 = async f => (await readFile(join(root, f))).toString('base64');

const LIVE = 'https://junkdrawer.works/engage/';
const html = await read('index.html');
let css = await read('css/app.css');
for (const [, file] of css.matchAll(/url\(\.\.\/fonts\/([^)]+)\)/g)) {
  css = css.replace(`url(../fonts/${file})`, `url(data:font/woff2;base64,${await b64(`fonts/${file}`)})`);
}

// `text` with every `from` swapped for `to`. A patch that finds nothing stops the build.
function swap(text, from, to, where) {
  if (!text.includes(from)) throw new Error(`build-artifact: ${where} no longer has ${JSON.stringify(from)} to patch`);
  return text.replaceAll(from, to);
}
// A room's links back to the bridge, and a script's `BRIDGE`, go to the live site.
const bridgeLinks = (body, page) => swap(body, 'href="./"', `href="${LIVE}" target="_blank" rel="noopener"`, page);
const liveBridge = pageScript => (name, src) => (name === pageScript ? swap(src, "const BRIDGE = './';", `const BRIDGE = '${LIVE}';`, `js/${name}.js`) : src);

// Each module becomes a function that returns its exports; imports read from those.
async function bundle(order, patch = (name, src) => src) {
  let js = '';
  const done = new Set();
  for (const name of order) {
    let src = await read(`js/${name}.js`);
    src = src.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*'\.\/([\w-]+)\.js';\s*$/gm, (_, names, mod) => {
      if (!done.has(mod)) throw new Error(`build-artifact: js/${name}.js imports js/${mod}.js, which is not before it on the list [${order.join(', ')}]`);
      return `const {${names.replace(/(\w+)\s+as\s+(\w+)/g, '$1: $2')}} = __m[${JSON.stringify(mod)}];`;
    });
    const exported = [];
    src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s+(\w+)/gm, (_, kind, id) => { exported.push(id); return `${kind} ${id}`; });
    src = src.replace(/^\s*if \('serviceWorker' in navigator.*$/m, '');
    src = await patch(name, src);
    const left = src.match(/^(?:import|export)\b.*$/m);
    if (left) throw new Error(`build-artifact: js/${name}.js has a line the bundler can't turn into plain script: ${left[0]}`);
    done.add(name);
    js += `__m[${JSON.stringify(name)}] = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`;
  }
  return js;
}
const pageBody = page => page.slice(page.indexOf('<body') , page.indexOf('</body>')).replace(/^<body[^>]*>/, '').replace(/<script type="module" src="[^"]+"><\/script>/, '');

const ORDER = ['physics', 'destinations', 'charts', 'classes', 'audio', 'ships', 'log', 'search', 'share', 'store', 'catalog', 'sky', 'app'];
const js = await bundle(ORDER, async (name, src) => {
  if (name !== 'app') return src;
  for (const [from, to] of [
    ["img.src = 'img/milkyway.png';", `img.src = 'data:image/png;base64,${await b64('img/milkyway.png')}';`],
    ["const SURVEY = 'survey.html';", `const SURVEY = '${LIVE}survey.html';`],
    ["const TONIGHT = 'tonight.html';", `const TONIGHT = '${LIVE}tonight.html';`],
    ["const SCALE = 'warp.html';", `const SCALE = '${LIVE}warp.html';`],
  ]) src = swap(src, from, to, 'js/app.js');
  return src;
});
const data = {
  'data/stars.bin': await b64('data/stars.bin'),
  'data/stars.json': await read('data/stars.json'),
};
const shim = `
const __data = { bin: '${data['data/stars.bin']}', json: ${JSON.stringify(data['data/stars.json'])} };
window.fetch = async url => {
  if (String(url).endsWith('stars.bin')) {
    const raw = atob(__data.bin), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return { arrayBuffer: async () => bytes.buffer };
  }
  if (String(url).endsWith('stars.json')) return { json: async () => JSON.parse(__data.json) };
  throw new Error('not bundled: ' + url);
};
`;

const title = html.match(/<title>.*?<\/title>/)[0];
let body = pageBody(html);
for (const room of ['survey', 'maru', 'missions', 'tonight', 'xeno', 'contact', 'warp']) {
  body = swap(body, `href="${room}.html"`, `href="${LIVE}${room}.html" target="_blank" rel="noopener"`, 'index.html');
}
const bridgeOut = `${title}
<meta name="theme-color" content="#05070d">
<style>
${css}
</style>
${body}
<script type="module">
const __m = {};
${shim}
${js}
</script>
`;
await mkdir(out, { recursive: true });
await writeFile(join(out, 'engage.html'), bridgeOut);
console.log(`engage.html: ${(bridgeOut.length / 1024 / 1024).toFixed(2)} MB`);

// The planetary survey, as its own single file. Links back to the bridge go to the live site.
const surveyHtml = await read('survey.html');
const surveyJs = await bundle(['physics', 'classes', 'planet-art', 'store', 'onscreen', 'share', 'survey'], liveBridge('survey'));
const surveyCss = css + '\n' + await read('css/survey.css');
const surveyOut = `<title>Planetary survey</title>
<meta name="theme-color" content="#05070d">
<style>
${surveyCss}
</style>
<div class="survey-root">
${bridgeLinks(pageBody(surveyHtml), 'survey.html')}
</div>
<script type="module">
const __m = {};
document.body.classList.add('survey');
${surveyJs}
</script>
`;
await writeFile(join(out, 'survey.html'), surveyOut);
console.log(`survey.html: ${(surveyOut.length / 1024).toFixed(0)} KB`);

// The Kobayashi Maru, as its own single file. Links back to the bridge go to the live site.
const maruHtml = await read('maru.html');
const maruJs = await bundle(['audio', 'store', 'onscreen', 'maru-sim', 'maru']);
const maruOut = `<title>Kobayashi Maru</title>
<meta name="theme-color" content="#05070d">
<style>
${css}
${await read('css/maru.css')}
</style>
<div class="maru-root">
${bridgeLinks(pageBody(maruHtml), 'maru.html')}
</div>
<script type="module">
const __m = {};
document.body.classList.add('maru');
${maruJs}
</script>
`;
await writeFile(join(out, 'maru.html'), maruOut);
console.log(`maru.html: ${(maruOut.length / 1024).toFixed(0)} KB`);

// Long missions, as its own single file. Links back to the bridge go to the live site.
const missionsHtml = await read('missions.html');
const missionsJs = await bundle(['physics', 'ships', 'ephemeris', 'store', 'onscreen', 'share', 'missions'], liveBridge('missions'));
const missionsOut = `<title>Long missions</title>
<meta name="theme-color" content="#05070d">
<style>
${css}
${await read('css/missions.css')}
</style>
<div class="missions-root">
${bridgeLinks(pageBody(missionsHtml), 'missions.html')}
</div>
<script type="module">
const __m = {};
document.body.classList.add('missions');
${missionsJs}
</script>
`;
await writeFile(join(out, 'missions.html'), missionsOut);
console.log(`missions.html: ${(missionsOut.length / 1024).toFixed(0)} KB`);

// Tonight's sky, as its own single file, with the stars inline. Links back to the bridge go to the live site.
const tonightHtml = await read('tonight.html');
const tonightJs = await bundle(['physics', 'destinations', 'ephemeris', 'astro', 'charts', 'ships', 'log', 'catalog', 'wake', 'store', 'share', 'tonight'], liveBridge('tonight'));
const tonightOut = `<title>Tonight’s sky</title>
<meta name="theme-color" content="#05070d">
<style>
${css}
${await read('css/tonight.css')}
</style>
${bridgeLinks(pageBody(tonightHtml), 'tonight.html')}
<script type="module">
const __m = {};
document.body.classList.add('tonight');
${shim}
${tonightJs}
</script>
`;
await writeFile(join(out, 'tonight.html'), tonightOut);
console.log(`tonight.html: ${(tonightOut.length / 1024 / 1024).toFixed(2)} MB`);

// The xenobiology lab, as its own single file. Links to the bridge and the survey go to the live site.
const xenoHtml = await read('xeno.html');
const xenoJs = await bundle(['physics', 'classes', 'planet-art', 'xeno-gen', 'xeno-art', 'species', 'share', 'store', 'onscreen', 'xeno'], liveBridge('xeno'));
const xenoOut = `<title>Xenobiology lab</title>
<meta name="theme-color" content="#05070d">
<style>
${css}
${await read('css/survey.css')}
${await read('css/xeno.css')}
</style>
${bridgeLinks(pageBody(xenoHtml), 'xeno.html')}
<script type="module">
const __m = {};
document.body.classList.add('survey', 'xeno');
${xenoJs}
</script>
`;
await writeFile(join(out, 'xeno.html'), xenoOut);
console.log(`xeno.html: ${(xenoOut.length / 1024).toFixed(0)} KB`);

// First contact, as its own single file. Links back to the bridge go to the live site.
const contactHtml = await read('contact.html');
const contactJs = await bundle(['audio', 'store', 'onscreen', 'contact-sim', 'contact-art', 'contact']);
const contactOut = `<title>First contact</title>
<meta name="theme-color" content="#05070d">
<style>
${css}
${await read('css/contact.css')}
</style>
${bridgeLinks(pageBody(contactHtml), 'contact.html')}
<script type="module">
const __m = {};
document.body.classList.add('contact');
${contactJs}
</script>
`;
await writeFile(join(out, 'contact.html'), contactOut);
console.log(`contact.html: ${(contactOut.length / 1024).toFixed(0)} KB`);

// The warp scale, as its own single file. Links back to the bridge go to the live site.
const warpHtml = await read('warp.html');
const warpJs = await bundle(['physics', 'ephemeris', 'warp-scale', 'wake', 'store', 'share', 'warp'], liveBridge('warp'));
const warpOut = `<title>Warp scale</title>
<meta name="theme-color" content="#05070d">
<style>
${css}
${await read('css/survey.css')}
${await read('css/warp.css')}
</style>
${bridgeLinks(pageBody(warpHtml), 'warp.html')}
<script type="module">
const __m = {};
document.body.classList.add('survey', 'warp-page');
${warpJs}
</script>
`;
await writeFile(join(out, 'warp.html'), warpOut);
console.log(`warp.html: ${(warpOut.length / 1024).toFixed(0)} KB`);
