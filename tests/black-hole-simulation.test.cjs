const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const memory = new Map();
const window = { sessionStorage: {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value)
} };
const context = vm.createContext({ window });
for (const name of ['black-hole-physics.js', 'black-hole-simulation.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js', name), 'utf8'), context);
}
const P = window.KerrNewmanPhysics;
const S = window.BlackHoleSimulation;
const json = (value) => JSON.stringify(value);
assert.equal(S.load().config, null);
for (const [name, preset] of Object.entries(S.PRESETS)) {
  const config = S.presetConfiguration(name);
  const shared = S.run(config);
  // Compare with the pre-existing 2D path: same constants, initialization and solver.
  const params = P.dimensionlessParameters(config.physical);
  const initial = P.initialStateFromConstants(params, {
    radius: preset.radius, energy: preset.energy, angularMomentum: preset.lz,
    massive: preset.object === 'massive', radialDirection: preset.direction
  });
  const baseline = P.integrateGeodesic(params, initial, { maxLambda: preset.maxLambda });
  assert.equal(json(shared.initialState), json(initial), name);
  assert.equal(json(shared.result), json(baseline), name);
  assert.equal(S.save(config), true);
  assert.equal(json(S.run(S.load().config).result), json(baseline), `${name}: session round trip`);
  assert.ok(shared.result.points.every((point) => point.every(Number.isFinite)), name);
  console.log(`${name}: identical to 2D; ${shared.result.points.length} samples; ${shared.result.stopReason}`);
}
const successful = json(S.load().config);
const modified = S.load().config;
modified.initial.radius = -1;
assert.throws(() => S.run(modified));
assert.equal(S.save(modified), false);
assert.equal(json(S.load().config), successful, 'failed run/save retains previous success');
for (const mutate of [
  (c) => { c.version = 999; },
  (c) => { c.physical.massSolar = 0; },
  (c) => { c.physical.chargeC = Infinity; },
  (c) => { c.initial.energy = NaN; },
  (c) => { c.initial.radialDirection = 'invalid'; },
  (c) => { c.initial.massive = 'false'; },
  (c) => { c.maxLambda = 1e9; },
  (c) => { c.preset = '__proto__'; }
]) {
  const config = S.presetConfiguration(); mutate(config); assert.throws(() => S.run(config));
}
const inside = S.presetConfiguration(); inside.initial.radius = 1;
assert.throws(() => S.run(inside), (error) => error.code === 'insideOuterHorizon');
const impossible = S.presetConfiguration(); impossible.initial.angularMomentum = 1e6;
assert.throws(() => S.run(impossible), (error) => error.code === 'nonRealRadialVelocity');
const naked = S.presetConfiguration(); naked.physical.angularMomentum = P.angularMomentumForSpin(10, 1.2);
assert.equal(S.run(naked).properties.hasHorizon, false);
const storageKey = [...memory.keys()][0];
memory.set(storageKey, '{corrupt'); assert.equal(S.load().error, true);
window.sessionStorage.getItem = () => { throw new Error('blocked'); };
window.sessionStorage.setItem = () => { throw new Error('blocked'); };
assert.equal(S.load().error, true); assert.equal(S.save(S.presetConfiguration()), false);
const validation = P.runScientificValidation();
assert.equal(validation.passed, true, json(validation));
console.log('Validation, invalid inputs, super-extremality and storage failure tests passed.');
