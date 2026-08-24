// Builds geogame/data/geodata.json from world-atlas TopoJSON + world-countries metadata.
// Run: NODE_PATH=<dir with node_modules> node build-geodata.mjs <path-to-countries-110m.json>
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const { feature } = require('topojson-client');
const { geoNaturalEarth1, geoAzimuthalEqualArea, geoPath, geoCentroid, geoArea } = require('d3-geo');
const worldCountries = require('world-countries');

const topoPath = process.argv[2];
const cjDir = process.argv[3]; // optional: country-json src dir for population/religion/etc.
if (!topoPath) { console.error('usage: build-geodata.mjs <countries-110m.json> [country-json-src-dir]'); process.exit(1); }
const topo = require(topoPath);
const fc = feature(topo, topo.objects.countries);

// world-atlas ids are numeric ISO 3166-1 strings; join to world-countries by ccn3.
const byCcn3 = new Map(worldCountries.map(c => [c.ccn3, c]));
// A few 110m entries carry non-standard ids; map them by name.
const nameFixes = new Map([
  ['Kosovo', 'XK'], ['N. Cyprus', null], ['Somaliland', null],
]);
const byCca2 = new Map(worldCountries.map(c => [c.cca2, c]));

// --- extra almanac data from country-json (keyed by its own country names) ---
const cjAlias = { // world-countries common name -> country-json name
  'Fiji': 'Fiji Islands', 'DR Congo': 'The Democratic Republic of Congo',
  'Republic of the Congo': 'Congo', 'Timor-Leste': 'East Timor',
  'Türkiye': 'Turkey', 'Czechia': 'Czech Republic',
};
// countries absent from country-json entirely
const cjManual = {
  'Taiwan': { pop: 23400000, rel: 'Buddhism, Taoism', dish: 'Beef noodle soup', life: 80.5, gov: 'Republic', temp: 22 },
  'Kosovo': { pop: 1800000, rel: 'Islam', dish: 'Flija', life: 76.5, gov: 'Republic', temp: 10 },
};
let cjFor = () => ({});
if (cjDir) {
  const load = n => {
    const m = new Map();
    for (const row of require(join(cjDir, 'country-by-' + n + '.json'))) m.set(row.country, row);
    return m;
  };
  const pop = load('population'), rel = load('religion'), dish = load('national-dish'),
        life = load('life-expectancy'), gov = load('government-type'), temp = load('yearly-average-temperature');
  cjFor = name => {
    if (cjManual[name]) return cjManual[name];
    const n = cjAlias[name] || name;
    const num = v => (typeof v === 'number' ? v : (v ? Number(v) : null)) || null;
    return {
      pop: num(pop.get(n)?.population),
      rel: rel.get(n)?.religion || null,
      dish: dish.get(n)?.dish || null,
      life: num(life.get(n)?.expectancy),
      gov: gov.get(n)?.government || null,
      temp: num(temp.get(n)?.temperature),
    };
  };
}

function roundedContext(dec) {
  const f = 10 ** dec;
  const r = v => Math.round(v * f) / f;
  let out = '';
  return {
    moveTo(x, y) { out += `M${r(x)} ${r(y)}`; },
    lineTo(x, y) { out += `L${r(x)} ${r(y)}`; },
    closePath() { out += 'Z'; },
    arc() {},
    result() { const s = out; out = ''; return s; },
  };
}

// --- World map: Natural Earth projection into a 1000x520 viewBox ---
const W = 1000, H = 520;
const worldProj = geoNaturalEarth1().fitExtent([[0, 0], [W, H]], { type: 'Sphere' });
const worldCtx = roundedContext(0);
const worldPathGen = geoPath(worldProj, worldCtx);

// --- Per-country shape: azimuthal equal-area centered on the country ---
// For the outline quiz, drop far-flung territories (French Guiana on France,
// Alaska/Hawaii on the US) so the shape reads as the recognizable mainland.
function angDistDeg([l1, f1], [l2, f2]) {
  const r = Math.PI / 180;
  const c = Math.sin(f1 * r) * Math.sin(f2 * r) + Math.cos(f1 * r) * Math.cos(f2 * r) * Math.cos((l1 - l2) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
}
function mainlandFeature(feat) {
  const g = feat.geometry;
  if (g.type !== 'MultiPolygon') return feat;
  const polys = g.coordinates.map(c => ({
    c,
    area: geoArea({ type: 'Polygon', coordinates: c }),
    cen: geoCentroid({ type: 'Polygon', coordinates: c }),
  }));
  polys.sort((a, b) => b.area - a.area);
  const main = polys[0];
  const keep = polys.filter(p => p === main || (p.area >= main.area * 0.03 && angDistDeg(p.cen, main.cen) <= 25));
  return { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: keep.map(p => p.c) } };
}
function shapeFor(rawFeat) {
  const feat = mainlandFeature(rawFeat);
  const [lon, lat] = geoCentroid(feat);
  const proj = geoAzimuthalEqualArea().rotate([-lon, -lat]).fitExtent([[6, 6], [194, 194]], feat);
  const ctx = roundedContext(1);
  geoPath(proj, ctx)(feat);
  return ctx.result();
}

const countries = [];
const skipped = [];
for (const feat of fc.features) {
  const rawName = feat.properties?.name ?? '';
  let meta = byCcn3.get(String(feat.id).padStart(3, '0'));
  if (!meta && nameFixes.has(rawName)) {
    const cca2 = nameFixes.get(rawName);
    meta = cca2 ? byCca2.get(cca2) : null;
  }
  if (!meta) { // draw on the map, but not a quiz subject
    skipped.push(rawName || feat.id);
    worldPathGen(feat);
    countries.push({ a2: null, name: rawName, map: worldCtx.result() });
    continue;
  }
  if (meta.cca2 === 'AQ') { // Antarctica: on the map, but not a quiz subject
    worldPathGen(feat);
    countries.push({ a2: 'AQ', name: 'Antarctica', map: worldCtx.result() });
    continue;
  }
  worldPathGen(feat);
  const mapD = worldCtx.result();
  const [cx, cy] = worldProj(geoCentroid(feat));
  const cj = cjFor(meta.name.common);
  countries.push({
    a2: meta.cca2,
    name: meta.name.common,
    capital: meta.capital?.[0] ?? null,
    region: meta.region,
    subregion: meta.subregion,
    flag: meta.flag,
    area: meta.area,
    ll: meta.latlng,
    cx: Math.round(cx), cy: Math.round(cy),
    langs: Object.values(meta.languages || {}).slice(0, 4),
    cur: Object.values(meta.currencies || {}).map(c => c.name).slice(0, 2),
    landlocked: meta.landlocked ? 1 : 0,
    nb: (meta.borders || []).length,
    pop: cj.pop ?? null,
    rel: cj.rel ?? null,
    dish: cj.dish ?? null,
    life: cj.life ?? null,
    gov: cj.gov ?? null,
    temp: cj.temp ?? null,
    map: mapD,
    shape: shapeFor(feat),
  });
}

const project = ([lat, lon]) => {
  const [x, y] = worldProj([lon, lat]);
  return [Math.round(x), Math.round(y)];
};

// The app re-implements geoNaturalEarth1's raw polynomial to place lat/lng markers;
// export scale/translate and verify the formula reproduces d3 within half a pixel.
const k = worldProj.scale(), [tx, ty] = worldProj.translate();
function appProject(lat, lon) {
  const la = lon * Math.PI / 180, phi = lat * Math.PI / 180;
  const p2 = phi * phi, p4 = p2 * p2;
  const x = la * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [tx + k * x, ty - k * y];
}
let maxErr = 0;
for (const [lat, lon] of [[0, 0], [48.85, 2.35], [-33.9, 151.2], [64.1, -21.9], [-54, -68], [35.7, 139.7], [71, 25]]) {
  const [ax, ay] = appProject(lat, lon);
  const [dx, dy] = worldProj([lon, lat]);
  maxErr = Math.max(maxErr, Math.hypot(ax - dx, ay - dy));
}
if (maxErr > 0.5) throw new Error(`projection formula mismatch: ${maxErr}px`);
console.log(`projection formula max error: ${maxErr.toFixed(4)}px`);

const out = { viewBox: [W, H], proj: { k: Math.round(k * 1000) / 1000, tx: Math.round(tx * 100) / 100, ty: Math.round(ty * 100) / 100 }, countries };

const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'geodata.json');
writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest}: ${countries.length} countries, skipped: ${skipped.join(', ') || 'none'}`);
console.log(`size: ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
