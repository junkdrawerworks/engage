// Counts every creature the xenobiology lab can grow:  node tools/xeno-census.mjs
// The lab rolls specimen numbers 1 to 9,999 for each of its 17 classes, so there are 169,983 creatures in all. This
// grows each one and writes how many of each class's have each body plan into js/xeno-gen.js (the CENSUS table,
// between its two marker comments), which is what the specimen card's "Uncommon: 171 of Class M's 9,999 specimens
// fly" is read from. It also prints who holds each record on the lab's shelf: if one has changed hands, set RECORDS
// in js/xeno-gen.js to match. Run it after any change to how creatures are grown; test/xeno.test.mjs fails until
// the table and the records are right again.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { takeCensus, grow, sizeText, gText, RECORDS } from '../js/xeno-gen.js';

const file = fileURLToPath(new URL('../js/xeno-gen.js', import.meta.url));
const { counts, holders, total } = takeCensus();
const table = `export const CENSUS = {\n${Object.entries(counts).map(([cls, plans]) => `  ${/^\w+$/.test(cls) ? cls : `'${cls}'`}: { ${Object.entries(plans).map(([plan, n]) => `${plan}: ${n}`).join(', ')} },`).join('\n')}\n};`;
const src = await readFile(file, 'utf8');
const marked = /(\/\/ census:start[^\n]*\n)[\s\S]*?(\n\/\/ census:end)/;
if (!marked.test(src)) throw new Error('js/xeno-gen.js has lost its census:start and census:end markers');
const next = src.replace(marked, (_, a, b) => `${a}${table}${b}`);
if (next !== src) await writeFile(file, next);
console.log(`${total.toLocaleString('en-US')} creatures counted. CENSUS in js/xeno-gen.js ${next === src ? 'was already right' : 'has been rewritten'}.`);
for (const [id, h] of Object.entries(holders)) {
  const c = grow(h.cls, h.seed), on = RECORDS.find(r => r.id === id);
  const stale = !on || on.cls !== h.cls || on.seed !== h.seed || h.shared !== 1;
  console.log(`${id}: ${h.cls}-${h.seed} ${c.name.common} (${c.body.plan}, ${sizeText(c.body.size)}, ${gText(c.env.g)})${h.shared > 1 ? `, shared by ${h.shared}` : ''}${stale ? '   <-- RECORDS does not say this' : ''}`);
}
