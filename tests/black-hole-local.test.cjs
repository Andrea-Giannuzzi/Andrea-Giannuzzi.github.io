const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const records = new Map();
const context = vm.createContext({ window: { sessionStorage: {
  getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value)
} } });
for (const name of ['physics', 'simulation']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, `../assets/js/black-hole-${name}.js`), 'utf8'), context);
}
const P = context.window.KerrNewmanPhysics, S = context.window.BlackHoleSimulation;
const kerr = { M: 1, a: 0.7, q: 0.2 };
const local = { radius: 12, latitude: 23, azimuth: 110, elevation: 20, speed: 0.4, massive: true, photonEnergy: 1 };
const close = (actual, expected, tolerance = 1e-11) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

test('ZAMO tetrad is orthonormal; local/coordinate conversion preserves state', () => {
  for (const massive of [true, false]) {
    const options = { ...local, massive, speed: massive ? local.speed : 1, photonEnergy: 2.3 };
    const state = P.initialStateFromLocal(kerr, options);
    const frame = P.zamoFrame(kerr, state[1], state[2]);
    const g = P.metric(kerr, state[1], state[2]);
    const basis = [[1 / frame.lapse, 0, 0, frame.omega / frame.lapse],
      [0, 1 / frame.radialScale, 0, 0], [0, 0, 1 / frame.polarScale, 0], [0, 0, 0, 1 / frame.azimuthalScale]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let contraction = 0;
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) contraction += g[a][b] * basis[i][a] * basis[j][b];
      close(contraction, i === j ? (i === 0 ? -1 : 1) : 0);
    }
    close(P.conservedQuantities(kerr, state).normalization, massive ? -1 : 0);
    const recovered = P.localConditionsFromState(kerr, state, massive);
    for (const name of ['latitude', 'azimuth', 'elevation', 'speed']) close(recovered[name], options[name]);
    close(distance(state, P.initialStateFromLocal(kerr, recovered)), 0);
  }
});

test('Six legacy presets convert without losing photon normalization or persisted 2D data', () => {
  for (const name of Object.keys(S.PRESETS)) {
    const legacy = S.presetConfiguration(name);
    const original = S.prepare(legacy);
    const config = S.toLocalConfiguration(legacy);
    close(distance(original.initialState, S.prepare(config).initialState), 0);
    assert.equal(S.save(legacy), true);
    const saved = JSON.stringify(S.load().config);
    assert.equal(S.save(config), false);
    assert.equal(JSON.stringify(S.load().config), saved);
    assert.equal(config.initial.latitude, 0);
  }
});

test('Schwarzschild inclined geodesic remains in its own orbital plane', () => {
  const params = { M: 1, a: 0, q: 0 };
  const state = P.initialStateFromLocal(params, local);
  const cartesian = state => [state[1] * Math.sin(state[2]) * Math.cos(state[3]),
    state[1] * Math.sin(state[2]) * Math.sin(state[3]), state[1] * Math.cos(state[2])];
  const [t, r, theta, phi, ut, ur, utheta, uphi] = state;
  const position = cartesian(state);
  const tangent = [ur * Math.sin(theta) * Math.cos(phi) + r * Math.cos(theta) * utheta * Math.cos(phi) - r * Math.sin(theta) * Math.sin(phi) * uphi,
    ur * Math.sin(theta) * Math.sin(phi) + r * Math.cos(theta) * utheta * Math.sin(phi) + r * Math.sin(theta) * Math.cos(phi) * uphi,
    ur * Math.cos(theta) - r * Math.sin(theta) * utheta];
  const normal = [position[1] * tangent[2] - position[2] * tangent[1], position[2] * tangent[0] - position[0] * tangent[2], position[0] * tangent[1] - position[1] * tangent[0]];
  const result = P.integrateGeodesic(params, state, { maxLambda: 20, guardCoordinates: true });
  assert.equal(result.stopReason, 'maximumInterval');
  for (const point of result.points) {
    const xyz = cartesian(point);
    close(xyz.reduce((sum, x, i) => sum + x * normal[i], 0) / Math.hypot(...normal), 0, 1e-9);
  }
  assert.ok(Math.abs(result.finalState[2] - state[2]) > 0.01, 'theta is dynamically evolving');
});

test('Kerr-Newman inclined photon conserves invariants and converges at RK4 order', () => {
  const params = { M: 1, a: 0.5, q: 0.2 };
  const state = P.initialStateFromLocal(params, { ...local, radius: 4, latitude: 20, azimuth: 100, elevation: 30, speed: 1, massive: false });
  const results = [0.02, 0.01, 0.005].map(step => P.integrateGeodesic(params, state, { step, maxLambda: 8, guardCoordinates: true }));
  for (const result of results) {
    assert.equal(result.stopReason, 'maximumInterval');
    for (const key of ['normalizationError', 'relativeEnergyChange', 'relativeAngularMomentumChange', 'scaledCarterChange']) assert.ok(result.checks[key] < 1e-8, key);
  }
  const coarse = distance(results[0].finalState, results[1].finalState);
  const fine = distance(results[1].finalState, results[2].finalState);
  assert.ok(coarse / fine > 10 && coarse / fine < 24, `convergence ratio ${coarse / fine}`);
});

test('Massive inclined Kerr orbit conserves Carter; zero speed and negative E are valid', () => {
  const state = P.initialStateFromLocal(kerr, local);
  const result = P.integrateGeodesic(kerr, state, { maxLambda: 20, guardCoordinates: true });
  assert.equal(result.stopReason, 'maximumInterval');
  assert.ok(result.checks.scaledCarterChange < 1e-8);
  close(P.conservedQuantities(kerr, P.initialStateFromLocal(kerr, { ...local, speed: 0 })).angularMomentum, 0);
  const zero = P.localConditionsFromState(kerr, P.initialStateFromLocal(kerr, { ...local, speed: 0 }), true);
  close(zero.speed, 0);
  const negative = S.toLocalConfiguration(S.presetConfiguration());
  negative.physical.angularMomentum = P.angularMomentumForSpin(10, 0.9);
  Object.assign(negative.initial, { radius: 1.8, latitude: 0, azimuth: -90, elevation: 0, speed: 0.99, massive: true });
  const prepared = S.prepare(negative);
  assert.ok(P.conservedQuantities(prepared.params, prepared.initialState).energy < 0);
});

test('Invalid launches are rejected; coordinate stops retain a valid final state', () => {
  for (const change of [{ speed: 1 }, { speed: -0.1 }, { latitude: 90 }, { elevation: 91 }, { azimuth: 181 }, { radius: 1 }, { speed: NaN }]) {
    assert.throws(() => P.initialStateFromLocal(kerr, { ...local, ...change }));
  }
  const nearLight = P.initialStateFromLocal(kerr, { ...local, speed: 0.9999 });
  close(P.conservedQuantities(kerr, nearLight).normalization, -1, 1e-7);
  const nearPole = P.initialStateFromLocal(kerr, { ...local, latitude: 89.9, elevation: 90, speed: 0.5 });
  const polarResult = P.integrateGeodesic(kerr, nearPole, { maxLambda: 2, guardCoordinates: true });
  assert.equal(polarResult.stopReason, 'coordinateAxis');
  assert.ok(polarResult.finalState[2] > 1e-6);
  assert.ok(polarResult.points.every(point => point.every(Number.isFinite)));
  const capture = P.initialStateFromLocal(kerr, { ...local, radius: 4, latitude: 10, azimuth: 180, elevation: 0 });
  const captured = P.integrateGeodesic(kerr, capture, { maxLambda: 20, guardCoordinates: true });
  assert.equal(captured.stopReason, 'outerHorizon');
  assert.ok(captured.finalState[1] > P.horizonData(kerr).outer);
});

test('3D presets populate non-equatorial conditions and integrate successfully', () => {
  for (const name of Object.keys(S.PRESETS_3D)) {
    const config = S.presetConfiguration(name);
    assert.equal(config.version, 2);
    assert.notEqual(config.initial.latitude, 0);
    assert.notEqual(config.initial.elevation, 0);
    assert.ok(Number.isFinite(config.initial.azimuth));
    assert.ok(config.initial.massive ? config.initial.speed < 1 : config.initial.speed === 1);
    const run = S.run(config);
    assert.equal(run.result.stopReason, 'maximumInterval', name);
    assert.ok(run.result.points.length > 100, name);
    assert.ok(run.result.checks.scaledCarterChange < 1e-7, name);
  }
});

test('Current 2D fields transfer independently of the last executed simulation', () => {
  const previous = S.presetConfiguration('photonCapture');
  S.save(previous);
  const draft = S.presetConfiguration('massiveFlyby', 'geometrized');
  draft.initial.radius = 21;
  draft.preset = null;
  assert.equal(S.transferTo3D(draft, false), true);
  let transferred = S.load3DTransfer();
  assert.equal(JSON.stringify(transferred.config), JSON.stringify(draft));
  assert.equal(transferred.autoRun, false);
  assert.equal(JSON.stringify(S.load().config), JSON.stringify(previous));
  assert.equal(S.transferTo3D(previous, true), true);
  assert.equal(S.load3DTransfer().autoRun, true);
  const invalid = S.presetConfiguration(); invalid.initial.radius = 1;
  assert.throws(() => S.transferTo3D(invalid, false));
  assert.equal(S.load3DTransfer().config.initial.radius, previous.initial.radius);
  records.set('black-hole-2d-to-3d-v1', '{broken');
  assert.equal(S.load3DTransfer().error, true);
});
