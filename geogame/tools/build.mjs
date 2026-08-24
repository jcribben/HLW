// Assembles geogame/index.html from src/app.html + data files.
// Run: node tools/build.mjs   (from geogame/)
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as curated from '../data/curated.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tpl = readFileSync(join(root, 'src', 'app.html'), 'utf8');
const geodata = readFileSync(join(root, 'data', 'geodata.json'), 'utf8');

const curatedJson = JSON.stringify({
  tier1: curated.tier1Countries,
  tier3: curated.tier3Countries,
  excluded: curated.excludedCountries,
  cities: curated.cities,
  features: curated.features,
});

const esc = s => s.replace(/</g, '\\u003c');
let out = tpl.replace('"__GEODATA__"', () => esc(geodata))
             .replace('"__CURATED__"', () => esc(curatedJson));
if (out.includes('__GEODATA__') || out.includes('__CURATED__')) {
  throw new Error('placeholder replacement failed');
}
writeFileSync(join(root, 'index.html'), out);
console.log(`wrote index.html (${(out.length / 1024).toFixed(0)} KB)`);
