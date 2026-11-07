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

test('The lensing map inverts the table: viewing angle and brightness linear in the true angle', () => {
  // psi = angle + deflection: -190, -100, -40, 0, 36.
  const table = { samples: [{ angle: 5, deflection: null }, { angle: 10, deflection: -200 }, { angle: 12, deflection: -112 },
    { angle: 16, deflection: -56 }, { angle: 20, deflection: -20 }, { angle: 40, deflection: -4 }] };
  const map = C.lensingImageMap(table);
  assert.deepEqual([...map.alphas], [10, 12, 16, 20, 40]);
  assert.deepEqual([...map.psis], [-190, -100, -40, 0, 36]);
  // Secondary images (psi < 0): (sin alpha / |sin psi|) dalpha/dpsi, from the
  // samples either side, at most 1; primary images: 1.
  const sine = (degrees) => Math.sin(degrees * Math.PI / 180);
  const brightness = [sine(10) / sine(190 - 180) * 2 / 90, sine(12) / sine(100) * 6 / 150, sine(16) / sine(40) * 8 / 100, 1, 1];
  map.brightness.forEach((value, i) => assertClose(value, brightness[i], 1e-12, `brightness ${i}`));
  const image = (psi) => C.lensedImage(map, psi);
  assert.equal(image(0).angle, 20, 'Einstein ring');
  assertClose(image(18).angle, 30, 1e-12, 'primary, mid interval');
  assertClose(image(-70).angle, 14, 1e-12, 'secondary, mid interval');
  assertClose(image(-70).brightness, (brightness[1] + brightness[2]) / 2, 1e-12, 'secondary brightness');
  assert.equal(image(-190).angle, 10, 'first sample');
  assert.equal(image(-191), null, 'closer to the shadow edge than the first sample');
  assert.equal(image(50).angle, 54, 'beyond the last sample the last deflection holds');
  assert.equal(C.lensingImageMap(null), null, 'no table');
  assert.equal(C.lensingImageMap({ samples: table.samples.slice(0, 2) }), null, 'one escaped sample');
});

test('Inverting a real table puts each image within 0.2 degrees of the traced one, with no fold', () => {
  const params = { M: 1, a: 0, q: 0 };
  const cameraRadius = 30;
  const map = C.lensingImageMap(P.computeLensingTable(params, { cameraRadius }));
  // The true direction psi of the star seen at viewing angle alpha (< 90), traced
  // by computeLensingTable itself with two samples, 0 and alpha.
  const traced = (alpha) => {
    const sample = P.computeLensingTable(params, { cameraRadius, samples: 2, maxAngle: alpha }).samples[1];
    return alpha + sample.deflection;
  };
  for (const psi of [-120, -40, -5, 2, 15, 45, 80]) {
    const { angle } = C.lensedImage(map, psi);
    // The traced rays 0.2 degrees either side of the drawn image bracket the star.
    assert.ok(traced(angle - 0.2) < psi && psi < traced(angle + 0.2), `psi ${psi}: drawn at ${angle}°`);
  }
  map.alphas.forEach((alpha, i) => assert.equal(C.lensedImage(map, map.psis[i]).angle, alpha, `sample ${i}`));
  const edge = P.computeLensingTable(params, { cameraRadius }).samples[0].angle;
  const ring = C.lensedImage(map, 0).angle;
  let previous = { primary: ring, secondary: ring };
  for (let psi = 0.25; psi <= 180; psi += 0.25) {
    const primary = C.lensedImage(map, psi).angle;
    const secondary = C.lensedImage(map, -psi)?.angle;
    assert.ok(primary > previous.primary, `primary images move out as psi grows: ${primary}° at psi ${psi}`);
    if (secondary === undefined) continue;
    assert.ok(secondary < previous.secondary && secondary > edge, `secondary images close in on the shadow edge: ${secondary}° at psi ${psi}`);
    previous = { primary, secondary };
  }
  assert.ok(ring > edge + 5, `Einstein ring ${ring}° beyond the shadow edge ${edge}°`);
  // Magnified next to the Einstein ring, the secondary images are capped at
  // full brightness there and fade toward the shadow edge.
  const secondaryBrightness = map.brightness.filter((_, i) => map.psis[i] < 0);
  assert.equal(secondaryBrightness[secondaryBrightness.length - 1], 1, 'capped next to the ring');
  assert.ok(secondaryBrightness.every((value) => value > 0 && value <= 1) && secondaryBrightness[0] < 0.01,
    `secondary brightness ${secondaryBrightness.map((value) => value.toFixed(3))}`);
});

test('Stars move to their images, at the same distance: the primary on their side, the secondary across the hole', () => {
  const camera = { x: 0, y: 0, z: 30 };
  const hole = { x: 0, y: 0, z: 0 };
  const toHole = [0, 0, -1];
  // psi = -90 at 10 degrees and 90 at 100: alpha = 55 + psi / 2 between them.
  const table = { samples: [{ angle: 10, deflection: -100 }, { angle: 100, deflection: -10 }] };
  const map = C.lensingImageMap(table);
  const star = (angle, azimuth, distance) => {
    const a = angle * Math.PI / 180, b = azimuth * Math.PI / 180;
    return [Math.sin(a) * Math.cos(b) * distance, Math.sin(a) * Math.sin(b) * distance, camera.z - Math.cos(a) * distance];
  };
  const stars = [[0, 0, -10], star(30, 90, 20), star(30, 45, 12), star(70, 10, 25), star(120, 200, 20)];
  const original = Float64Array.from(stars.flat());
  const baseColors = Float64Array.from(stars.flatMap((_, i) => [0.2 * i, 0.5, 1]));
  const out = new Float64Array(original.length);
  const secondary = { positions: new Float64Array(original.length), colors: new Float64Array(original.length), baseColors };
  C.lensStarField(original, out, camera, hole, table, secondary);
  const relative = (array, i) => [array[3 * i] - camera.x, array[3 * i + 1] - camera.y, array[3 * i + 2] - camera.z];
  const azimuth = (vector) => Math.atan2(vector[1], vector[0]);

  // A star behind the hole goes to its Einstein ring, at psi = 0.
  assertClose(angleBetween(relative(out, 0), toHole), 55, 1e-9, 'star 0: Einstein ring');
  for (const [i, primary, secondaryAngle] of [[0, 55, 55], [1, 70, 40], [2, 70, 40], [3, 90, 20], [4, 130, null]]) {
    const distance = Math.hypot(...relative(original, i));
    assertClose(angleBetween(relative(out, i), toHole), primary, 1e-9, `star ${i}: primary angle`);
    assertClose(Math.hypot(...relative(out, i)), distance, 1e-9, `star ${i}: primary distance`);
    const colors = [...secondary.colors.slice(3 * i, 3 * i + 3)];
    if (secondaryAngle === null) {
      assert.deepEqual(colors, [0, 0, 0], `star ${i}: no secondary image in the table, black`);
      assert.deepEqual([...secondary.positions.slice(3 * i, 3 * i + 3)], [...out.slice(3 * i, 3 * i + 3)], `star ${i}: parked on its primary`);
      continue;
    }
    assertClose(angleBetween(relative(secondary.positions, i), toHole), secondaryAngle, 1e-9, `star ${i}: secondary angle`);
    assertClose(Math.hypot(...relative(secondary.positions, i)), distance, 1e-9, `star ${i}: secondary distance`);
    const { brightness } = C.lensedImage(map, -angleBetween(relative(original, i), toHole));
    colors.forEach((value, c) => assertClose(value, baseColors[3 * i + c] * brightness, 1e-12, `star ${i}: secondary color ${c}`));
    if (i === 0) continue;
    // Same plane through the camera axis: the primary keeps the azimuth around
    // it, the secondary lies opposite.
    assertClose(azimuth(relative(out, i)), azimuth(relative(original, i)), 1e-12, `star ${i}: primary azimuth`);
    assertClose(Math.cos(azimuth(relative(secondary.positions, i)) - azimuth(relative(original, i))), -1, 1e-12, `star ${i}: secondary azimuth`);
  }

  // The lensing is centered on the hole it is given, wherever the camera looks.
  const shifted = { x: 4, y: -2, z: 1 };
  const moved = Float64Array.from(stars.flat().map((value, i) => value + [4, -2, 1][i % 3]));
  const movedOut = new Float64Array(original.length);
  C.lensStarField(moved, movedOut, { x: 4, y: -2, z: 31 }, shifted, table);
  movedOut.forEach((value, i) => assertClose(value - [4, -2, 1][i % 3], out[i], 1e-9, `translated scene, component ${i}`));
  assert.match(source, /C\.lensStarField\([^;]*camera\.position, blackHole\.position, lensingTable/, 'the scene lenses around the hole, not controls.target');

  const copy = new Float64Array(original.length);
  const dark = { positions: new Float64Array(original.length), colors: Float64Array.from(baseColors), baseColors };
  C.lensStarField(original, copy, camera, hole, null, dark);
  assert.deepEqual([...copy], [...original], 'no table: true positions');
  assert.deepEqual([...dark.positions], [...original], 'no table: secondary images at the true positions');
  assert.ok(dark.colors.every((value) => value === 0), 'no table: secondary images black');
});

test('The status line adds the translated stop reason and the over-extremal warning where they belong', () => {
  // Every stop reason integrateGeodesic can return, read from its source: the
  // string literals there are exactly those (a thrown code is kept only when
  // listed, otherwise it becomes invalidMetric), so a new reason without IT/EN
  // copy fails here. escapedToLarge needs an escapeRadius, which only the
  // lensing table sets, but its copy must still exist.
  const reasons = [...new Set([...P.integrateGeodesic.toString().matchAll(/"(\w+)"/g)].map(([, reason]) => reason))];
  assert.ok(reasons.length >= 8 && reasons.includes('escapedToLarge'), `stop reasons found: ${reasons}`);
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
