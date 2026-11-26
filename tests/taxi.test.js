import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findStay, taxiModel, telHref } from '../js/modules/taxi.js';

const lodging = JSON.parse(await readFile(new URL('../data/global/lodging.json', import.meta.url), 'utf8'));
const stays = lodging.stays;

test('findStay matches by id, then by name ignoring case, spaces and punctuation', () => {
  assert.equal(findStay(stays, { id: 'osaka' }).id, 'osaka');
  assert.equal(findStay(stays, { name: 'the bridge hotel  SHINSAIBASHI' }).id, 'osaka');
  assert.equal(findStay(stays, { name: 'Agora Kyoto Karasuma' }).id, 'kyoto');
  assert.equal(findStay(stays, { name: 'Hotel inexistente' }), null);
  assert.equal(findStay(stays, {}), null);
});

test('the same hotel booked twice resolves to a stay with the same address', () => {
  assert.equal(findStay(stays, { name: 'HOTEL AMANEK Asakusa Sakurabashi' }).address, stays.find((stay) => stay.id === 'tokyo-2').address);
});

test('taxiModel uses the Japanese text when both name and address exist and copies the address', () => {
  const model = taxiModel({ name: 'Hotel X', address: '1-2-3 Foo', nameJa: 'ホテルX', addressJa: '東京都1-2-3', mapsUrl: 'https://maps.example/x', phone: '+81 3-1234-5678', cityName: 'Tokio' });
  assert.equal(model.hasJapanese, true);
  assert.equal(model.copyText, 'ホテルX\n東京都1-2-3');
  assert.equal(model.phone, '+81 3-1234-5678');
});

test('without Japanese text it falls back to the Latin name and says so (never invented text)', () => {
  const model = taxiModel({ name: 'Hotel X', address: '1-2-3 Foo', mapsUrl: 'https://maps.example/x' });
  assert.equal(model.hasJapanese, false);
  assert.equal(model.nameJa, '');
  assert.equal(model.copyText, 'Hotel X\n1-2-3 Foo');
});

test('a hotel that is not in the lodging list still gets a directions link', () => {
  const model = taxiModel(null, { name: 'Hotel Z', city: 'Kioto' });
  assert.match(model.mapsUrl, /destination=Hotel%20Z%2C%20Kioto/);
});

test('telHref keeps digits and the plus sign only', () => {
  assert.equal(telHref('+81 (0)75-353-1118'), 'tel:+810753531118');
});

test('every stay in the public data has a name, address and maps link; Japanese fields are optional but paired', () => {
  stays.forEach((stay) => {
    assert.ok(stay.name && stay.address && /^https:\/\//.test(stay.mapsUrl), stay.id);
    assert.equal(Boolean(stay.nameJa), Boolean(stay.addressJa), `${stay.id}: nameJa and addressJa go together`);
    if (stay.nameJa) assert.match(stay.nameJa + stay.addressJa, /[぀-ヿ一-鿿]/);
  });
});

test('the public lodging data holds no private fields', () => {
  const text = JSON.stringify(lodging);
  ['pin', 'reserva', 'pagado', 'coste'].forEach((word) => assert.ok(!new RegExp(`"${word}`, 'i').test(text)));
});
