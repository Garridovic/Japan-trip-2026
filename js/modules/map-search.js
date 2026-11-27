// Map search: fuzzy matching over the points the map shows (names are mostly romaji, so typos like "ryouanji" must still work).
// Pure module (no DOM, no Leaflet). The matching engine is uFuzzy (assets/vendor/ufuzzy); what is ours is the folding of
// romaji spellings, the category aliases ("templo" also finds -dera / -ji) and the ranking (name before description).
import uFuzzy from '../../assets/vendor/ufuzzy/uFuzzy.esm.js';

export const MIN_QUERY = 2;
const FUZZY_FROM = 4; // terms shorter than this must match exactly: one typo in 3 letters matches almost everything

/** Same romaji written in different ways ends up as the same key (ou/ō/o, shi/si, tsu/tu, ji/zi, doubled consonants…). */
export function foldRomaji(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-'’·・]/g, '')
    .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, ' ')
    .replace(/ou|oo/g, 'o').replace(/uu/g, 'u')
    .replace(/tch/g, 'ch').replace(/shi/g, 'si').replace(/chi/g, 'ti').replace(/tsu/g, 'tu').replace(/fu/g, 'hu').replace(/ji/g, 'zi')
    .replace(/jy|zy/g, 'z').replace(/sh/g, 's').replace(/ch/g, 't').replace(/j/g, 'z')
    .replace(/([bcdfghkmpqrstwz])\1/g, '$1').replace(/nn/g, 'n').replace(/y/g, 'i')
    .replace(/\s+/g, ' ').trim();
}

// Spanish category words the user types vs the Japanese endings the names carry (and the other way round).
const plain = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ALIASES = [
  { words: 'templo temple dera tera', test: /(dera|tera|[a-z]-?ji\b)/ },
  { words: 'santuario shrine torii jinja jingu taisha', test: /(jinja|taisha|jingu|santuario)/ },
  { words: 'castillo castle jo shiro', test: /(castillo|\bjo\b|-jo\b|shiro)/ }
];
const aliasesFor = (point) => {
  const name = plain(point.name);
  const words = ALIASES.filter(({ test }) => test.test(name)).map(({ words: w }) => w);
  if (point.type === 'restaurant') words.push('restaurante comida');
  if (point.type === 'hotel') words.push('hotel alojamiento');
  return words.join(' ');
};

const fuzzy = new uFuzzy({ intraMode: 1, intraIns: 1, intraSub: 1, intraTrn: 1, intraDel: 1, intraSlice: [1, Infinity] });
const exact = new uFuzzy({ intraMode: 0 });

/** points: [{id, name, query?, desc?, type?}] */
export function buildMapIndex(points = []) {
  return {
    points,
    names: points.map((point) => foldRomaji(`${point.name} ${point.query ?? ''} ${aliasesFor(point)}`)),
    descs: points.map((point) => foldRomaji(point.desc ?? ''))
  };
}

const termsOf = (query) => foldRomaji(query).split(' ').filter(Boolean);
export const isSearchable = (query) => foldRomaji(query).replace(/ /g, '').length >= MIN_QUERY;

/**
 * Matches in order: names (typo tolerant, best first), then points whose description contains every term exactly.
 * Returns the points (not indexes). An empty or too short query returns null = "no search active".
 */
export function searchPoints(index, query) {
  if (!isSearchable(query)) return null;
  const terms = termsOf(query);
  const needle = terms.join(' ');
  const engine = terms.some((term) => term.length >= FUZZY_FROM) ? fuzzy : exact;
  const byName = rank(engine, index.names, needle);
  const rest = new Set(byName);
  const byDesc = (exact.filter(index.descs, needle) ?? []).filter((i) => !rest.has(i));
  return [...byName, ...byDesc].map((i) => index.points[i]);
}

function rank(engine, haystack, needle) {
  const idxs = engine.filter(haystack, needle);
  if (!idxs?.length) return [];
  const info = engine.info(idxs, haystack, needle);
  return engine.sort(info, haystack, needle).map((position) => info.idx[position]);
}
