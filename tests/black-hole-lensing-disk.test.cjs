const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/black-hole-physics.js'), 'utf8'), context);
const P = context.window.KerrNewmanPhysics;

const schwarzschild = { M: 1, a: 0, q: 0 };
const kerr = { M: 1, a: 0.7, q: 0 };
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

test('Scientific validation, including the new Kepler/redshift/lensing checks, passes', () => {
  const report = P.runScientificValidation();
  assert.equal(report.passed, true, JSON.stringify(report, null, 2));
});

test('Numeric ISCO/photon-sphere radii agree with the formatted circularOrbitInformation strings', () => {
  assert.equal(P.iscoRadius(schwarzschild), 6);
  assert.equal(P.photonSphereRadius(schwarzschild), 3);
  assert.equal(P.circularOrbitInformation(schwarzschild).isco, '6.000000 M');
  assert.equal(P.circularOrbitInformation(schwarzschild).photon, '3.000000 M');

  const prograde = P.iscoRadius(kerr, 'prograde');
  const retrograde = P.iscoRadius(kerr, 'retrograde');
  assert.ok(prograde < 6 && retrograde > 6, 'Kerr ISCO brackets the Schwarzschild value');
  assert.equal(
    P.circularOrbitInformation(kerr).isco,
    `prograde ${prograde.toFixed(6)} M; retrograde ${retrograde.toFixed(6)} M`
  );

  // Reissner-Nordstrom and Kerr-Newman have no closed-form ISCO in this
  // module; both must stay honestly null/"N/A", not a fabricated number.
  const reissnerNordstrom = { M: 1, a: 0, q: 0.3 };
  const kerrNewman = { M: 1, a: 0.7, q: 0.2 };
  assert.equal(P.iscoRadius(reissnerNordstrom), null);
  assert.equal(P.iscoRadius(kerrNewman), null);
  assert.equal(P.photonSphereRadius(kerrNewman), null);
  assert.equal(P.circularOrbitInformation(kerrNewman).isco, 'N/A');
});

test('circularOrbitFourVelocity at the Schwarzschild ISCO matches the closed-form E and L', () => {
  // Standard textbook result for a Schwarzschild circular orbit at r = 6M:
  // E = (2*sqrt(2))/3, L = 2*sqrt(3) M. diskRedshiftFactor(r) = 1/u^t must
  // stay consistent with this same state (it is now a one-line wrapper
  // around this function).
  const state = P.circularOrbitFourVelocity(schwarzschild, 6, 'prograde');
  assert.ok(state, 'expected a valid circular orbit at the ISCO');
  assert.ok(Math.abs(state.energy - (2 * Math.sqrt(2)) / 3) < 1e-9, state.energy);
  assert.ok(Math.abs(state.angularMomentum - 2 * Math.sqrt(3)) < 1e-9, state.angularMomentum);
  assert.ok(Math.abs(P.diskRedshiftFactor(schwarzschild, 6) - 1 / state.uT) < 1e-12);

  // Kerr prograde ISCO must still return a physically valid, normalized
  // timelike circular orbit (u^t > 0, no NaNs) -- no closed form here, just
  // an internal-consistency check via the metric normalization itself.
  const kerrIsco = P.iscoRadius(kerr, 'prograde');
  const kerrState = P.circularOrbitFourVelocity(kerr, kerrIsco, 'prograde');
  assert.ok(kerrState && kerrState.uT > 0 && Number.isFinite(kerrState.energy) && Number.isFinite(kerrState.angularMomentum));
});

test('Disk redshift factor is <1 outside the horizon and approaches 1 at large radius', () => {
  for (const radius of [6, 8, 12, 30, 100]) {
    const g = P.diskRedshiftFactor(schwarzschild, radius);
    assert.ok(g > 0 && g < 1, `g(${radius}) = ${g}`);
  }
  const far = P.diskRedshiftFactor(schwarzschild, 1e6);
  assert.ok(Math.abs(far - 1) < 1e-5, `g(1e6) = ${far}`);
  // Kerr-Newman: no closed-form ISCO, but the redshift formula itself is
  // general (derived from the metric directly, not from the ISCO), so it
  // must still return a valid factor outside the horizon.
  const kerrNewman = { M: 1, a: 0.7, q: 0.2 };
  const gKN = P.diskRedshiftFactor(kerrNewman, 15);
  assert.ok(gKN > 0 && gKN < 1, `g_KN(15) = ${gKN}`);
});

test('Disk temperature is zero at the ISCO, positive just outside it, and falls off at large radius', () => {
  const isco = P.iscoRadius(schwarzschild);
  assert.equal(P.diskTemperature(schwarzschild, isco), 0);
  assert.equal(P.diskTemperature(schwarzschild, isco - 0.1), 0);
  assert.ok(P.diskTemperature(schwarzschild, isco + 0.5) > 0);
  // The Novikov-Thorne profile rises from zero at the ISCO to a peak nearby,
  // then falls off -- monotonic decrease only holds well past that peak.
  const far = [20, 30, 50, 80, 120].map((r) => P.diskTemperature(schwarzschild, r));
  for (let i = 1; i < far.length; i += 1) assert.ok(far[i] < far[i - 1], far);
});

test('Blackbody color stays in range and shifts blue as temperature rises', () => {
  const cool = P.blackbodyColor(3000);
  const neutral = P.blackbodyColor(6500);
  const hot = P.blackbodyColor(20000);
  for (const color of [cool, neutral, hot]) {
    for (const channel of [color.r, color.g, color.b]) assert.ok(channel >= 0 && channel <= 1);
  }
  assert.ok(cool.r >= cool.b, 'cool color is red-leaning');
  assert.ok(hot.b >= hot.r, 'hot color is blue-leaning');
});

test('Lensing table: near dead-center falls into the shadow, larger offsets escape with decreasing deflection', () => {
  const table = P.computeLensingTable(schwarzschild, {
    cameraRadius: 40, samples: 16, maxAngle: 60, escapeRadius: 450, maxLambda: 1200, step: 0.3, maxSteps: 4000
  });
  assert.equal(table.samples.length, 16);
  assert.equal(table.samples[0].stopReason, 'outerHorizon');
  assert.equal(table.samples[0].deflection, null);
  const escaped = table.samples.filter((sample) => sample.stopReason === 'escapedToLarge');
  assert.ok(escaped.length > 4, 'several samples escape past the shadow boundary');
  for (const sample of escaped) assert.ok(Number.isFinite(sample.deflection));
  // Deflection magnitude should decrease monotonically as the offset grows
  // away from the shadow boundary (away from the photon sphere).
  for (let i = 1; i < escaped.length; i += 1) {
    assert.ok(Math.abs(escaped[i].deflection) < Math.abs(escaped[i - 1].deflection),
      `deflection(${escaped[i].angle}) = ${escaped[i].deflection} vs deflection(${escaped[i - 1].angle}) = ${escaped[i - 1].deflection}`);
  }
});

test('Lensing far-field geodesics conserve invariants and converge at RK4 order', () => {
  const params = { M: 1, a: 0.3, q: 0 };
  const state = P.initialStateFromLocal(params, {
    radius: 40, latitude: 0, azimuth: 150, elevation: 0, speed: 1, massive: false, photonEnergy: 1
  });
  const escapeRadius = 450;
  const results = [1.2, 0.6, 0.3].map((step) => P.integrateGeodesic(params, state, {
    step, maxLambda: 1200, maxSteps: Math.ceil(1200 / step), sampleEvery: Math.ceil(1200 / step),
    escapeRadius, guardCoordinates: true
  }));
  for (const result of results) {
    assert.equal(result.stopReason, 'escapedToLarge', result.stopReason);
    for (const key of ['normalizationError', 'relativeEnergyChange', 'relativeAngularMomentumChange', 'scaledCarterChange']) {
      assert.ok(result.checks[key] < 1e-6, `${key} = ${result.checks[key]}`);
    }
  }
  const coarse = distance(results[0].finalState, results[1].finalState);
  const fine = distance(results[1].finalState, results[2].finalState);
  assert.ok(coarse / fine > 8, `convergence ratio ${coarse / fine} (expected roughly 16 for 4th-order RK4)`);
});
