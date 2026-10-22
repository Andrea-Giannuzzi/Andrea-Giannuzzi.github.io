const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
for (const file of ['black-hole-physics.js', 'black-hole-simulation.js', 'content.js', 'black-hole-3d-core.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js', file), 'utf8'), context);
}
const P = context.window.KerrNewmanPhysics;
const S = context.window.BlackHoleSimulation;
const C = context.window.BlackHole3DCore;
const copyFor = (language) => context.window.PORTFOLIO_CONTENT[language].blackHoleSimulator;
const page = fs.readFileSync(path.join(__dirname, '../black-hole-simulator-3d.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/black-hole-3d.js'), 'utf8');

// The presets the 3D page offers, each run once as the page runs it.
const presetNames = [...page.match(/<select id="bh-preset"[\s\S]*?<\/select>/)[0].matchAll(/<option value="(\w+)"/g)]
  .map(([, name]) => name).filter((name) => name !== 'custom');
const runs = presetNames.map((name) => ({ name, run: S.run(S.presetConfiguration(name)) }));

const assertClose = (actual, expected, tolerance, message) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
};
const angleBetween = (u, v) => {
  const dot = u.reduce((sum, x, i) => sum + x * v[i], 0);
  return Math.acos(Math.min(1, Math.max(-1, dot / (Math.hypot(...u) * Math.hypot(...v))))) * 180 / Math.PI;
};

test('Scene axes: y is the spin axis, x-z the equatorial plane, r is kept', () => {
  const cases = [
    [[0, 5, 0, 1.3], [0, 5, 0]],
    [[0, 5, Math.PI, 0], [0, -5, 0]],
    [[0, 5, Math.PI / 2, 0], [5, 0, 0]],
    [[0, 5, Math.PI / 2, Math.PI / 2], [0, 0, 5]]
  ];
  for (const [state, expected] of cases) {
    const position = C.scenePosition(state);
    expected.forEach((value, i) => assertClose(position[i], value, 1e-12, `${state} component ${i}`));
  }
  assertClose(Math.hypot(...C.scenePosition([0, 7, 0.4, 2.1])), 7, 1e-12, 'radius');
});

test('Every preset trajectory is drawn from its first state to its last, in increasing lambda', () => {
  assert.ok(runs.length >= 14, `presets found in the page: ${presetNames}`);
  for (const { name, run: { result } } of runs) {
    const { states, lambdas } = C.trajectorySamples(result);
    assert.equal(states.length, lambdas.length, name);
    const appended = states.length - result.points.length;
    assert.ok(appended === 0 || appended === 1, `${name}: ${appended} extra states`);
    result.points.forEach((point, i) => assert.equal(states[i], point, `${name}: sample ${i}`));
    assert.equal(lambdas[0], 0, name);
    for (let i = 1; i < lambdas.length; i += 1) assert.ok(lambdas[i] > lambdas[i - 1], `${name}: lambda ${i}`);
    assert.deepEqual([...states[states.length - 1]], [...result.finalState], `${name}: last state`);
    assert.equal(lambdas[lambdas.length - 1], result.lambda, `${name}: last lambda`);
  }
});

test('The final state is appended once, and only when it is finite and outside minRadius', () => {
  const state = (r) => [0, r, 1, 0, 1, 0, 0, 0];
  const result = (radii, final, lambda, stopReason = 'outerHorizon') => ({
    points: radii.map(state), sampleLambdas: radii.map((_, i) => i), finalState: final, lambda, stopReason
  });
  const radii = (samples) => [...samples.states.map((s) => s[1])];
  const lambdas = (samples) => [...samples.lambdas];

  const ten = [10, 9, 8, 7, 6, 5, 4, 3, 2.5, 1.5];
  assert.deepEqual(lambdas(C.trajectorySamples(result(ten.slice(0, 4), state(7), 3, 'maximumInterval'))), [0, 1, 2, 3],
    'last sample already the final state');
  assert.deepEqual(lambdas(C.trajectorySamples(result(ten.slice(0, 4), state(6.9), 3 + 1e-10))), [0, 1, 2, 3],
    'final state within 1e-9 of the last sample');
  assert.deepEqual(lambdas(C.trajectorySamples(result(ten.slice(0, 4), state(6.5), 3.4, 'nonFinite'))), [0, 1, 2, 3],
    'nonFinite stop');
  assert.deepEqual(lambdas(C.trajectorySamples(result(ten.slice(0, 4), [0, NaN, 1, 0, 1, 0, 0, 0], 3.4))), [0, 1, 2, 3],
    'NaN final state');
  assert.deepEqual(lambdas(C.trajectorySamples(result(ten.slice(0, 4), state(6.5), 3.4))), [0, 1, 2, 3, 3.4],
    'final state after the last sample');

  const strided = C.trajectorySamples(result(ten, state(2.2), 9.4), { stride: 3, minRadius: 2 });
  assert.deepEqual(radii(strided), [10, 7, 4, 2.2], 'every 3rd sample, r 1.5 skipped, final appended');
  assert.deepEqual(lambdas(strided), [0, 3, 6, 9.4]);
  assert.deepEqual(radii(C.trajectorySamples(result(ten, state(1.9), 9.4), { stride: 3, minRadius: 2 })), [10, 7, 4],
    'final state inside minRadius');
});

test('A plunge thinned to ~40 samples still reaches the horizon margin', () => {
  // The fall black-hole-3d.js buildPlungingRegion draws for Schwarzschild.
  const params = { M: 1, a: 0, q: 0 };
  const isco = P.iscoRadius(params);
  const horizon = P.horizonData(params).outer;
  const orbit = P.circularOrbitFourVelocity(params, isco, 'prograde');
  const seed = P.initialStateFromConstants(params, {
    radius: horizon + (isco - horizon) * 0.99, energy: orbit.energy, angularMomentum: orbit.angularMomentum,
    massive: true, radialDirection: 'ingoing'
  });
  const result = P.integrateGeodesic(params, seed, { guardCoordinates: true, maxLambda: 400, step: 0.03, maxSteps: 14000 });
  assert.equal(result.stopReason, 'outerHorizon');
  const stride = Math.max(1, Math.floor(result.points.length / 40));
  const lastStrided = result.points[Math.floor((result.points.length - 1) / stride) * stride];
  const { states } = C.trajectorySamples(result, { stride, minRadius: horizon });
  assert.ok(lastStrided[1] > 3, `the stride alone stops at r = ${lastStrided[1]}`);
  assert.ok(states.length >= 30 && states.length <= 45, `${states.length} samples`);
  assertClose(states[states.length - 1][1], horizon + P.NUMERICS.horizonMargin, 0.05, 'last drawn radius');
  assert.ok(states.every((state) => state[1] > horizon));
});

test('The playback cursor finds the interval and the fraction through it', () => {
  const lambdas = [0, 1, 3, 6];
  const cursor = (lambda, start) => ({ ...C.sampleCursor(lambdas, lambda, start) });
  assert.deepEqual(cursor(0), { index: 0, nextIndex: 1, fraction: 0 });
  assert.deepEqual(cursor(1), { index: 1, nextIndex: 2, fraction: 0 });
  assert.deepEqual(cursor(2), { index: 1, nextIndex: 2, fraction: 0.5 });
  assert.deepEqual(cursor(6), { index: 2, nextIndex: 3, fraction: 1 });
  assert.deepEqual(cursor(10), { index: 2, nextIndex: 3, fraction: 1 }, 'past the end');
  assert.deepEqual(cursor(-1), { index: 0, nextIndex: 1, fraction: 0 }, 'before the start');
  assert.deepEqual(cursor(4.5, 2), { index: 2, nextIndex: 3, fraction: 0.5 }, 'search from a kept cursor');
  assert.deepEqual(cursor(0.5, 2), { index: 2, nextIndex: 3, fraction: 0 }, 'the cursor never moves back');
  assert.deepEqual({ ...C.sampleCursor([5], 7) }, { index: 0, nextIndex: 0, fraction: 0 }, 'single sample');

  // Interpolating a linear function of lambda along a real trajectory gives it back.
  const { lambdas: times } = C.trajectorySamples(runs.find(({ name }) => name === 'photonCapture').run.result);
  const values = times.map((lambda) => 2 * lambda + 1);
  let index = 0;
  for (let lambda = 0; lambda <= times[times.length - 1]; lambda += 0.137) {
    const at = C.sampleCursor(times, lambda, index);
    index = at.index;
    assertClose(values[at.index] + (values[at.nextIndex] - values[at.index]) * at.fraction, 2 * lambda + 1, 1e-9, `lambda ${lambda}`);
  }
});

test('Lensing deflection is interpolated linearly between the escaped samples', () => {
  const table = { samples: [
    { angle: 5, deflection: null }, { angle: 10, deflection: -40 }, { angle: 20, deflection: -10 }, { angle: 40, deflection: -4 }
  ] };
  assert.equal(C.angularDeflectionFor(table, 3), 0, 'inside the shadow');
  assert.equal(C.angularDeflectionFor(table, 7), 0, 'before the first escaped sample');
  assertClose(C.angularDeflectionFor(table, 12.5), -32.5, 1e-12, 'quarter interval');
  assertClose(C.angularDeflectionFor(table, 15), -25, 1e-12, 'mid interval');
  assertClose(C.angularDeflectionFor(table, 20), -10, 1e-12, 'on a sample');
  assertClose(C.angularDeflectionFor(table, 30), -7, 1e-12, 'second interval');
  assert.equal(C.angularDeflectionFor(table, 40), -4, 'last sample');
  assert.equal(C.angularDeflectionFor(table, 55), -4, 'beyond the last sample');
  assert.equal(C.angularDeflectionFor(null, 15), 0, 'no table');
  assert.equal(C.angularDeflectionFor({ samples: table.samples.slice(0, 2) }, 15), 0, 'one escaped sample');

  const real = P.computeLensingTable({ M: 1, a: 0, q: 0 }, { cameraRadius: 38 });
  const escaped = real.samples.filter((sample) => sample.deflection !== null);
  assert.ok(escaped.length >= 10);
  for (let i = 1; i < escaped.length; i += 1) {
    const { angle, deflection } = escaped[i];
    assertClose(C.angularDeflectionFor(real, angle), deflection, 1e-12 * Math.abs(deflection), `sample at ${angle}°`);
    const middle = C.angularDeflectionFor(real, (angle + escaped[i - 1].angle) / 2);
    assertClose(middle, (deflection + escaped[i - 1].deflection) / 2, 1e-9, `between ${escaped[i - 1].angle}° and ${angle}°`);
  }
});

test('Stars move to their true angle minus the deflection, at the same distance and in the same plane', () => {
  const camera = { x: 0, y: 0, z: 30 };
  const target = { x: 0, y: 0, z: 0 };
  const toHole = [0, 0, -1];
  const table = { samples: [{ angle: 1, deflection: -2 }, { angle: 60, deflection: -2 }] };
  const star = (angle, azimuth, distance) => {
    const a = angle * Math.PI / 180, b = azimuth * Math.PI / 180;
    return [Math.sin(a) * Math.cos(b) * distance, Math.sin(a) * Math.sin(b) * distance, camera.z - Math.cos(a) * distance];
  };
  const stars = [[0, 0, -10], star(30, 90, 20), star(30, 45, 12), star(70, 10, 25), star(30, 200, 20)];
  const original = Float64Array.from(stars.flat());
  const out = new Float64Array(original.length);
  C.lensStarField(original, out, camera, target, table);
  const moved = (i) => [out[3 * i] - camera.x, out[3 * i + 1] - camera.y, out[3 * i + 2] - camera.z];
  const before = (i) => [original[3 * i] - camera.x, original[3 * i + 1] - camera.y, original[3 * i + 2] - camera.z];

  assert.deepEqual([...out.slice(0, 3)], [0, 0, -10], 'behind the hole: angle 0');
  assert.deepEqual([...out.slice(9, 12)], [...original.slice(9, 12)], 'beyond the table');
  for (const i of [1, 2, 4]) {
    assertClose(angleBetween(moved(i), toHole), 32, 1e-9, `star ${i}: angle`);
    assertClose(Math.hypot(...moved(i)), Math.hypot(...before(i)), 1e-9, `star ${i}: distance from the camera`);
    // Same plane through the camera axis: the azimuth around it is kept.
    assertClose(Math.atan2(moved(i)[1], moved(i)[0]), Math.atan2(before(i)[1], before(i)[0]), 1e-12, `star ${i}: azimuth`);
  }

  const copy = new Float64Array(original.length);
  C.lensStarField(original, copy, camera, target, null);
  assert.deepEqual([...copy], [...original], 'no table: true positions');

  const real = P.computeLensingTable({ M: 1, a: 0, q: 0 }, { cameraRadius: 30 });
  const realOut = new Float64Array(3);
  C.lensStarField(Float64Array.from(star(40, 20, 50)), realOut, camera, target, real);
  assertClose(angleBetween([realOut[0], realOut[1], realOut[2] - camera.z], toHole), 40 - C.angularDeflectionFor(real, 40), 1e-9,
    'real table');
});

test('The status line adds the translated stop reason and the over-extremal warning where they belong', () => {
  // integrateGeodesic's stop reasons for a run of the page; escapedToLarge needs an
  // escapeRadius, which only the lensing table sets.
  const reasons = ['coordinateAxis', 'maximumInterval', 'maximumSteps', 'outerHorizon', 'singularState', 'invalidMetric', 'nonFinite'];
  for (const language of ['it', 'en']) {
    const copy = copyFor(language);
    for (const stopReason of reasons) {
      const reasonText = copy.stopReasons[stopReason];
      assert.ok(typeof reasonText === 'string' && reasonText.length > 0, `${language}: stopReasons.${stopReason}`);
      const withHorizon = { result: { stopReason }, properties: { hasHorizon: true } };
      const overExtremal = { result: { stopReason }, properties: { hasHorizon: false } };
      for (const key of ['running', 'imported', 'end', 'motionReduced']) {
        assert.equal(C.statusMessage(copy, key, withHorizon), `${copy.threeD[key]} ${reasonText}`, `${language} ${key}`);
        assert.equal(C.statusMessage(copy, key, overExtremal), `${copy.threeD[key]} ${reasonText} ${copy.overExtremalWarning}`);
        assert.equal(C.statusMessage(copy, key, null), copy.threeD[key], `${language} ${key} before any run`);
      }
      for (const key of ['ready', 'computing', 'pause', 'webglError']) {
        assert.equal(C.statusMessage(copy, key, withHorizon), copy.threeD[key], `${language} ${key}`);
      }
      assert.equal(C.statusMessage(copy, 'pause', overExtremal), `${copy.threeD.pause} ${copy.overExtremalWarning}`);
      assert.equal(C.statusMessage(copy, 'webglError', overExtremal), copy.threeD.webglError, 'no scene, no warning');
    }
    for (const { name, run } of runs) {
      const message = C.statusMessage(copy, 'end', run);
      assert.ok(message.includes(copy.stopReasons[run.result.stopReason]) && !message.includes('undefined'), `${language} ${name}`);
    }
  }
});

test('Every message key and preset of the 3D page has Italian and English copy', () => {
  const keys = new Set();
  for (const [, args] of source.matchAll(/\b(?:text|setMessage)\(([^()]*)\)/g)) {
    for (const [, key] of args.matchAll(/"(\w+)"/g)) keys.add(key);
  }
  for (const [, value] of source.matchAll(/formMessageKey = ([^;]+);/g)) {
    for (const [, key] of value.matchAll(/"(\w+)"/g)) keys.add(key);
  }
  assert.ok(keys.size >= 15, `keys found in black-hole-3d.js: ${[...keys]}`);
  for (const language of ['it', 'en']) {
    const copy = copyFor(language);
    for (const key of keys) assert.ok(typeof copy.threeD[key] === 'string' && copy.threeD[key], `${language}: threeD.${key}`);
    for (const name of presetNames) assert.ok(copy.presets[name], `${language}: presets.${name}`);
  }
});
