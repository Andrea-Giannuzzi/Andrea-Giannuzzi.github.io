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
// Default Schwarzschild tables, built once: each costs ~2 s here.
const defaultTables = {};
const defaultTable = (cameraRadius) => (defaultTables[cameraRadius] ??= P.computeLensingTable(schwarzschild, { cameraRadius }));

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

  const reissnerNordstrom = { M: 1, a: 0, q: 0.3 };
  assert.equal(P.circularOrbitInformation(reissnerNordstrom).isco, `${P.iscoRadius(reissnerNordstrom).toFixed(6)} M`);

  // Kerr-Newman lists both senses, like Kerr. Without a horizon there is no
  // ISCO or photon orbit: "N/A", not a fabricated number.
  const kerrNewman = { M: 1, a: 0.7, q: 0.2 };
  const pair = (radius) => `prograde ${radius(kerrNewman, 'prograde').toFixed(6)} M; retrograde ${radius(kerrNewman, 'retrograde').toFixed(6)} M`;
  assert.equal(P.circularOrbitInformation(kerrNewman).isco, pair(P.iscoRadius));
  assert.equal(P.circularOrbitInformation(kerrNewman).photon, pair(P.photonSphereRadius));
  for (const overExtremal of [{ M: 1, a: 0, q: 1.01 }, { M: 1, a: 0.8, q: 0.7 }]) {
    assert.equal(P.iscoRadius(overExtremal), null);
    assert.equal(P.circularOrbitInformation(overExtremal).isco, 'N/A');
  }
  assert.equal(P.photonSphereRadius({ M: 1, a: 0.8, q: 0.7 }), null);
});

test('Kerr-Newman photon orbit: null circular orbits at the edges of the equatorial shadow, between the Kerr and Reissner-Nordstrom limits', () => {
  for (const params of [{ M: 1, a: 0.7, q: 0.2 }, { M: 1, a: 0.6, q: 0.48 }, { M: 1, a: 0.9, q: 0.3 }, { M: 1, a: 0.3, q: 0.9 }]) {
    const label = `a ${params.a} q ${params.q}`;
    const [prograde, retrograde] = ['prograde', 'retrograde'].map((sense) => P.photonSphereRadius(params, sense));
    assert.ok(P.horizonData(params).outer < prograde && prograde < retrograde, `${label}: ${prograde}, ${retrograde}`);
    // The circular orbit there, from the metric, is null.
    for (const [sense, radius] of [['prograde', prograde], ['retrograde', retrograde]]) {
      const omega = P.keplerianAngularVelocity(params, radius, sense);
      const g = P.metric(params, radius, Math.PI / 2);
      assert.ok(Math.abs(g[0][0] + 2 * omega * g[0][3] + omega * omega * g[3][3]) < 1e-14, `${label} ${sense}: not null`);
    }
    // Seen edge-on, the shadow edge comes from exactly these two orbits: its
    // photon-orbit range is bisected on beta^2 = 0, a different equation.
    const { rpMin, rpMax } = P.shadowContour(params, Math.PI / 2);
    assert.ok(Math.abs(rpMin - prograde) < 1e-12 && Math.abs(rpMax - retrograde) < 1e-12, `${label}: contour ${rpMin}, ${rpMax}`);
  }
  for (const sense of ['prograde', 'retrograde']) {
    assert.ok(Math.abs(P.photonSphereRadius({ M: 1, a: 0.7, q: 1e-7 }, sense) - P.photonSphereRadius({ M: 1, a: 0.7, q: 0 }, sense)) < 1e-9, `${sense}: Kerr limit`);
    assert.ok(Math.abs(P.photonSphereRadius({ M: 1, a: 1e-8, q: 0.8 }, sense) - P.photonSphereRadius({ M: 1, a: 0, q: 0.8 })) < 1e-6, `${sense}: Reissner-Nordstrom limit`);
  }
});

test('Reissner-Nordstrom ISCO: the circular orbit of least L_z, from 6 M uncharged to 4 M extremal', () => {
  // Checked against the metric, not the cubic it solves: L_z of the circular
  // orbits from circularOrbitFourVelocity is smallest at the ISCO.
  assert.ok(Math.abs(P.iscoRadius({ M: 1, a: 0, q: 1e-6 }) - 6) < 1e-9);
  assert.ok(Math.abs(P.iscoRadius({ M: 1, a: 0, q: 1 }) - 4) < 1e-12);
  let previous = 6;
  for (const q of [0.3, 0.5, 0.8, 0.95, 0.999]) {
    const params = { M: 1, a: 0, q };
    const isco = P.iscoRadius(params);
    assert.equal(P.iscoRadius(params, 'retrograde'), isco, `q ${q}: no spin, no sense`);
    assert.ok(isco < previous && isco > P.horizonData(params).outer, `q ${q}: ${isco}`);
    previous = isco;
    const angularMomentum = (r) => P.circularOrbitFourVelocity(params, r, 'prograde').angularMomentum;
    for (const offset of [-1e-3, 1e-3]) {
      assert.ok(angularMomentum(isco * (1 + offset)) > angularMomentum(isco), `q ${q}: L_z at ${offset} is not larger`);
    }
  }
  // 4.890767 at q = 0.8, where the 3D disk used to start at the uncharged 6.
  assert.ok(Math.abs(P.iscoRadius({ M: 1, a: 0, q: 0.8 }) - 4.890767) < 1e-6);
});

test('Reissner-Nordstrom: gas released just inside the ISCO plunges to the horizon, as the 3D view seeds it', () => {
  // buildPlungingRegion (black-hole-3d.js) seeds 99% of the way from the
  // horizon to the ISCO with the ISCO orbit's E and L_z. With the uncharged
  // ISCO (6 M) that seed lies in the stable region and is rejected, so the
  // charged view showed no plunging gas.
  const params = { M: 1, a: 0, q: 0.8 };
  const horizon = P.horizonData(params).outer;
  const seedFor = (isco) => {
    const orbit = P.circularOrbitFourVelocity(params, isco, 'prograde');
    return P.initialStateFromConstants(params, {
      radius: horizon + (isco - horizon) * 0.99, energy: orbit.energy, angularMomentum: orbit.angularMomentum,
      massive: true, radialDirection: 'ingoing'
    });
  };
  assert.throws(() => seedFor(6), (error) => error.code === 'nonRealRadialVelocity');
  const result = P.integrateGeodesic(params, seedFor(P.iscoRadius(params)), {
    guardCoordinates: true, maxLambda: 400, step: 0.03, maxSteps: 14000
  });
  assert.equal(result.stopReason, 'outerHorizon');
});

test('Kerr-Newman ISCO: the circular orbit of least |L_z| in each sense, between the Kerr and Reissner-Nordstrom limits', () => {
  // Checked against the metric, not the condition it solves, as for
  // Reissner-Nordstrom above.
  for (const sense of ['prograde', 'retrograde']) {
    for (const a of [0.1, 0.5, 0.9]) {
      assert.ok(Math.abs(P.iscoRadius({ M: 1, a, q: 1e-6 }, sense) - P.iscoRadius({ M: 1, a, q: 0 }, sense)) < 1e-9, `${sense} a ${a}: Kerr limit`);
      let previous = P.iscoRadius({ M: 1, a, q: 0 }, sense);
      for (const q of [0.1, 0.3, 0.4]) {
        const params = { M: 1, a, q };
        const isco = P.iscoRadius(params, sense);
        assert.ok(isco < previous && isco > P.horizonData(params).outer, `${sense} a ${a} q ${q}: ${isco}`);
        previous = isco;
        const angularMomentum = (r) => Math.abs(P.circularOrbitFourVelocity(params, r, sense).angularMomentum);
        for (const offset of [-1e-3, 1e-3]) {
          assert.ok(angularMomentum(isco * (1 + offset)) > angularMomentum(isco), `${sense} a ${a} q ${q}: |L_z| at ${offset} is not larger`);
        }
      }
    }
    for (const q of [0.3, 0.8]) {
      assert.ok(Math.abs(P.iscoRadius({ M: 1, a: 1e-7, q }, sense) - P.iscoRadius({ M: 1, a: 0, q })) < 1e-5, `${sense} q ${q}: Reissner-Nordstrom limit`);
    }
  }
  // The 3D view seeds its plunging gas just inside the ISCO (see the
  // Reissner-Nordstrom test above). From the spin-only Kerr ISCO it used for
  // Kerr-Newman, every stream was rejected; from the real one it plunges.
  const params = { M: 1, a: 0.7, q: 0.5 };
  const horizon = P.horizonData(params).outer;
  const seedFor = (isco) => {
    const orbit = P.circularOrbitFourVelocity(params, isco, 'prograde');
    return P.initialStateFromConstants(params, {
      radius: horizon + (isco - horizon) * 0.99, energy: orbit.energy, angularMomentum: orbit.angularMomentum,
      massive: true, radialDirection: 'ingoing'
    });
  };
  assert.throws(() => seedFor(P.iscoRadius(kerr)), (error) => error.code === 'nonRealRadialVelocity');
  const result = P.integrateGeodesic(params, seedFor(P.iscoRadius(params)), {
    guardCoordinates: true, maxLambda: 400, step: 0.03, maxSteps: 14000
  });
  assert.equal(result.stopReason, 'outerHorizon');
});

test('Kerr-Newman near the extremal limit: ISCO and photon orbit found down to the horizon, continuous with Kerr', () => {
  // The prograde orbits there lie closer to r_+ than one 0.01 M search step
  // and came out null (AND-20): the 3D disk then fell back to the uncharged
  // Kerr ISCO, 2.907 M at a 0.8, and the 2D panel showed "N/A" for both
  // senses. Checked against the metric, as above.
  for (const params of [{ M: 1, a: 0.8, q: 0.5999 }, { M: 1, a: 0.999999, q: 0.001 }, { M: 1, a: 0.8, q: 0.5999999 }]) {
    const label = `a ${params.a} q ${params.q}`;
    const horizon = P.horizonData(params).outer;
    for (const sense of ['prograde', 'retrograde']) {
      const photon = P.photonSphereRadius(params, sense);
      const isco = P.iscoRadius(params, sense);
      assert.ok(horizon < photon && photon < isco, `${label} ${sense}: r+ ${horizon}, photon ${photon}, ISCO ${isco}`);
      const omega = P.keplerianAngularVelocity(params, photon, sense);
      const g = P.metric(params, photon, Math.PI / 2);
      assert.ok(Math.abs(g[0][0] + 2 * omega * g[0][3] + omega * omega * g[3][3]) < 1e-12, `${label} ${sense}: photon orbit not null`);
      const angularMomentum = (r) => Math.abs(P.circularOrbitFourVelocity(params, r, sense).angularMomentum);
      for (const offset of [-1e-3, 1e-3]) {
        assert.ok(angularMomentum(isco * (1 + offset)) > angularMomentum(isco), `${label} ${sense}: |L_z| at ${offset} is not larger`);
      }
    }
    const info = P.circularOrbitInformation(params);
    assert.doesNotMatch(`${info.isco} ${info.photon}`, /N\/A/, label);
  }
  // At a 0.8, q 0.5999999 the prograde ISCO is about 1 M, not Kerr's 2.907 M.
  // The 3D disk takes the ZAMO frame there, inside the solver's 0.12 M
  // horizon margin, which still holds for launches.
  const nearExtremal = { M: 1, a: 0.8, q: 0.5999999 };
  const innerEdge = P.iscoRadius(nearExtremal);
  assert.ok(Math.abs(innerEdge - 1.008207) < 1e-6);
  assert.ok(P.zamoFrame(nearExtremal, innerEdge, Math.PI / 2).lapse > 0);
  assert.throws(() => P.initialStateFromLocal(nearExtremal, {
    radius: innerEdge, latitude: 0, azimuth: 90, elevation: 0, speed: 0.5, massive: true
  }), (error) => error.code === 'outerHorizon');
  for (const sense of ['prograde', 'retrograde']) {
    const kerrLimit = { M: 1, a: 0.999999, q: 0 };
    const charged = { M: 1, a: 0.999999, q: 1e-6 };
    assert.ok(Math.abs(P.iscoRadius(charged, sense) - P.iscoRadius(kerrLimit, sense)) < 1e-7, `${sense}: ISCO Kerr limit`);
    assert.ok(Math.abs(P.photonSphereRadius(charged, sense) - P.photonSphereRadius(kerrLimit, sense)) < 1e-7, `${sense}: photon orbit Kerr limit`);
  }
});

test('Without a horizon there is no ISCO or photon orbit, for every spacetime', () => {
  // Kerr with a > 1 used to give 1 M from a spin clamped to 1, while the same
  // hole with q 1e-6 gave null and the 3D disk moved between the two (AND-22).
  for (const params of [{ M: 1, a: 1.1, q: 0 }, { M: 1, a: 1.1, q: 1e-6 }, { M: 1, a: 0, q: 1.05 }, { M: 1, a: 0.8, q: 0.7 }]) {
    const label = `a ${params.a} q ${params.q}`;
    assert.equal(P.horizonData(params).hasHorizon, false, label);
    for (const sense of ['prograde', 'retrograde']) {
      assert.equal(P.iscoRadius(params, sense), null, `${label} ${sense}: ISCO`);
      assert.equal(P.photonSphereRadius(params, sense), null, `${label} ${sense}: photon orbit`);
    }
    const info = P.circularOrbitInformation(params);
    assert.equal(`${info.isco} | ${info.photon}`, 'N/A | N/A', label);
  }
  // Extremal Kerr keeps its closed form, both orbits at r_+ = M prograde.
  assert.ok(Math.abs(P.iscoRadius({ M: 1, a: 1, q: 0 }) - 1) < 1e-12);
  assert.ok(Math.abs(P.photonSphereRadius({ M: 1, a: 1, q: 0 }) - 1) < 1e-12);
});

test('The ergosphere drawn in 3D is where g_tt = 0, outside the horizon except at the poles', () => {
  const kerrNewman = { M: 1, a: 0.6, q: 0.48 };
  const horizon = P.horizonData(kerrNewman).outer;
  for (const theta of [0.2, Math.PI / 4, Math.PI / 3, Math.PI / 2, 2.5]) {
    const radius = P.outerStaticLimitAtTheta(kerrNewman, theta);
    assert.ok(radius > horizon, `theta ${theta}: ${radius}`);
    assert.ok(Math.abs(P.metric(kerrNewman, radius, theta)[0][0]) < 1e-14, `theta ${theta}: g_tt`);
    // Timelike just outside, spacelike just inside.
    assert.ok(P.metric(kerrNewman, radius * 1.01, theta)[0][0] < 0 && P.metric(kerrNewman, radius * 0.99, theta)[0][0] > 0, `theta ${theta}: sign`);
  }
  assert.ok(Math.abs(P.outerStaticLimitAtTheta(kerrNewman, 0) - horizon) < 1e-15, 'tangent at the pole');
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
  // T is the fourth root of the flux r^-3 (1 - sqrt(r_isco/r)): hottest at
  // (49/36) r_isco, T ~ r^(-3/4) far out.
  let peak = isco;
  for (let r = isco; r < 3 * isco; r += 1e-4 * isco) {
    if (P.diskTemperature(schwarzschild, r) > P.diskTemperature(schwarzschild, peak)) peak = r;
  }
  assert.ok(Math.abs(peak / isco - 49 / 36) < 2e-4, `peak at ${peak / isco} r_isco`);
  assert.ok(Math.abs(P.diskTemperature(schwarzschild, 49 / 36 * isco) - 6500) < 1e-9, 'peakKelvin is the peak');
  const slope = Math.log(P.diskTemperature(schwarzschild, 6e5) / P.diskTemperature(schwarzschild, 6e4)) / Math.log(10);
  assert.ok(Math.abs(slope + 0.75) < 1e-3, `far slope ${slope}`);
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

test('Lensing table in Kerr samples the side it shows: its shadow edge is the Bardeen edge at alpha > 0', () => {
  // The camera looks toward +phi, where for a > 0 the received photons are
  // counter-rotating (L_z < 0): the wider edge, alpha = -xi = 6.83 at a = 0.9,
  // not the co-rotating one at alpha = -2.84.
  const params = { M: 1, a: 0.9, q: 0 };
  const edge = Math.max(...P.shadowContour(params, Math.PI / 2).points.map((point) => point.alpha));
  const { samples } = P.computeLensingTable(params, { cameraRadius: 38, samples: 40, maxAngle: 20 });
  const first = samples.findIndex((sample) => sample.stopReason === 'escapedToLarge');
  assert.ok(first > 0, 'the table crosses the shadow edge');
  assert.ok(samples.slice(0, first).every((sample) => sample.stopReason === 'outerHorizon'));
  assert.ok(samples.slice(first).every((sample) => sample.stopReason === 'escapedToLarge'));
  const [inside, outside] = [samples[first - 1].impactParameter, samples[first].impactParameter];
  assert.ok(inside > -edge && -edge > outside, `xi ${inside} > ${-edge} > ${outside}`);
});

test('Lensing deflection near the shadow edge is accumulated, not folded into (-180, 180]', () => {
  // The Schwarzschild edge is at 7.648 degrees from camera radius 38; the
  // closest of these rays winds more than a full turn before escaping.
  const deflections = [7.655, 7.67, 7.75, 7.85, 8.1].map((angle) => {
    const [, sample] = P.computeLensingTable(schwarzschild, { cameraRadius: 38, samples: 2, maxAngle: angle }).samples;
    assert.equal(sample.stopReason, 'escapedToLarge', `angle ${angle}`);
    return sample.deflection;
  });
  assert.ok(deflections[0] < -360, `deflections ${deflections}`);
  for (let i = 1; i < deflections.length; i += 1) {
    assert.ok(deflections[i - 1] < deflections[i] && deflections[i] < 0, `deflections ${deflections}`);
  }
});

test('The default table starts on the shadow edge with frame dragging: first ray captured, second escaped', () => {
  // Close to a fast-spinning hole the ZAMO frame's rotation moves the edge by
  // about 1 % (omega xi ~ 0.012 at camera 10, a 0.9), several times the first
  // sample interval; at camera 38 it is too small to test.
  for (const params of [{ M: 1, a: 0.9, q: 0 }, { M: 1, a: 0.6, q: 0.48 }]) {
    const [edge, next] = P.computeLensingTable(params, { cameraRadius: 10 }).samples;
    assert.equal(edge.deflection, null, `a ${params.a} q ${params.q}: ${edge.angle}° escaped (${edge.stopReason})`);
    assert.equal(next.stopReason, 'escapedToLarge', `a ${params.a} q ${params.q}: ${next.angle}° captured`);
  }
});

test('A camera close to the hole still lenses: the default table starts at the shadow edge', () => {
  // A static observer at r sees the Schwarzschild edge at
  // sin(psi) = 3 sqrt(3) M sqrt(1 - 2M/r) / r: 66.7 degrees at r = 4, past
  // the 60 degrees the table used to stop at.
  for (const cameraRadius of [4, 38]) {
    const edge = Math.asin(3 * Math.sqrt(3) * Math.sqrt(1 - 2 / cameraRadius) / cameraRadius) * 180 / Math.PI;
    const { samples } = defaultTable(cameraRadius);
    assert.ok(Math.abs(samples[0].angle - edge) < 1e-9, `r ${cameraRadius}: ${samples[0].angle} vs ${edge}`);
    const escaped = samples.filter((sample) => sample.stopReason === 'escapedToLarge');
    assert.ok(escaped.length >= samples.length - 1, `r ${cameraRadius}: ${escaped.length} of ${samples.length} escape`);
    // 20 samples from the edge to maxAngle, in [60, 90), then 8 on to 180.
    assert.equal(samples.length, 28);
    assert.ok(samples[19].angle >= 60 && samples[19].angle < 90, `r ${cameraRadius}: maxAngle ${samples[19].angle}`);
  }
});

test('The default table carries on to 180 degrees, its deflection shrinking smoothly to about 0', () => {
  // A ray traced as the table traces it, at an angle the table does not sample.
  const traced = (params, table, angle) => {
    const initial = P.initialStateFromLocal(params, {
      radius: table.cameraRadius, latitude: 0, azimuth: angle - 180, elevation: 0, speed: 1, massive: false, photonEnergy: 1
    });
    const result = P.integrateGeodesic(params, initial, table.settings);
    assert.equal(result.stopReason, 'escapedToLarge', `angle ${angle}`);
    return P.escapeDeflection(result.finalState, angle);
  };
  // Past maxAngle the deflection is still -5.6 degrees at camera 38 and -64 at
  // camera 4, where the 3D view used to drop it to 0. Kerr ends at +0.04 at
  // 180 degrees, frame dragging on a ray with L_z = 0.
  const cases = [
    { params: schwarzschild, table: defaultTable(38), tolerance: 0.05 },
    { params: schwarzschild, table: defaultTable(4), tolerance: 0.4 },
    { params: { M: 1, a: 0.9, q: 0 }, table: P.computeLensingTable({ M: 1, a: 0.9, q: 0 }, { cameraRadius: 38 }) }
  ];
  for (const { params, table, tolerance } of cases) {
    const label = `a ${params.a}, r ${table.cameraRadius}`;
    const tail = table.samples.slice(19);
    assert.equal(tail.length, 9, label);
    assert.equal(tail[8].angle, 180, label);
    assert.ok(Math.abs(tail[8].deflection) < 0.1, `${label}: ${tail[8].deflection} at 180°`);
    for (let i = 1; i < tail.length; i += 1) {
      assert.equal(tail[i].stopReason, 'escapedToLarge', `${label}: ${tail[i].angle}°`);
      assert.ok(tail[i].deflection > tail[i - 1].deflection, `${label}: ${tail[i - 1].deflection} then ${tail[i].deflection}`);
      if (tolerance === undefined) continue;
      // The 3D view interpolates linearly between samples: halfway between
      // two of them the line stays near the traced curve.
      const middle = (tail[i - 1].angle + tail[i].angle) / 2;
      const error = (tail[i - 1].deflection + tail[i].deflection) / 2 - traced(params, table, middle);
      assert.ok(Math.abs(error) < tolerance, `${label}: ${error} at ${middle}°`);
    }
  }
});

test('Lensing far-field geodesics conserve invariants and converge at RK4 order', () => {
  const params = { M: 1, a: 0.3, q: 0 };
  const state = P.initialStateFromLocal(params, {
    radius: 40, latitude: 0, azimuth: 150, elevation: 0, speed: 1, massive: false, photonEnergy: 1
  });
  // Compare the three runs at the same affine parameter, before the photon
  // reaches escapeRadius: escape stops land at step-dependent lambdas, so
  // their final states differ at first order in h, not at RK4 order.
  const escapeRadius = 450;
  const maxLambda = 360;
  const results = [1.2, 0.6, 0.3].map((step) => P.integrateGeodesic(params, state, {
    step, maxLambda, maxSteps: Math.ceil(maxLambda / step), sampleEvery: Math.ceil(maxLambda / step),
    escapeRadius, guardCoordinates: true
  }));
  // The same ray run on to escapeRadius covers the guarded escape stop in Kerr.
  const escaped = P.integrateGeodesic(params, state, {
    step: 0.3, maxLambda: 1200, maxSteps: 4000, sampleEvery: 4000, escapeRadius, guardCoordinates: true
  });
  for (const result of results) assert.equal(result.stopReason, 'maximumInterval', result.stopReason);
  assert.equal(escaped.stopReason, 'escapedToLarge', escaped.stopReason);
  for (const result of [...results, escaped]) {
    for (const key of ['normalizationError', 'relativeEnergyChange', 'relativeAngularMomentumChange', 'scaledCarterChange']) {
      assert.ok(result.checks[key] < 1e-6, `${key} = ${result.checks[key]}`);
    }
  }
  const coarse = distance(results[0].finalState, results[1].finalState);
  const fine = distance(results[1].finalState, results[2].finalState);
  assert.ok(coarse / fine > 8, `convergence ratio ${coarse / fine} (expected roughly 16 for 4th-order RK4)`);
});

test('A camera beyond the old 450 M escape radius still lenses, at the same step budget and converged', () => {
  // Up to 225 M the settings are the fixed ones every table had.
  const near = P.computeLensingTable(schwarzschild, { cameraRadius: 225, samples: 2, maxAngle: 30 }).settings;
  assert.deepEqual([near.escapeRadius, near.maxLambda, near.step, near.maxSteps], [450, 1200, 0.3, 4000]);
  // At 460 M a fixed 450 M escape radius counted every ray as escaped at launch.
  const cameraRadius = 460;
  const table = P.computeLensingTable(schwarzschild, { cameraRadius });
  const { settings, samples } = table;
  assert.ok(Math.abs(settings.escapeRadius - 2 * cameraRadius) < 1e-9, `escape radius ${settings.escapeRadius}`);
  assert.equal(settings.maxSteps, 4000);
  assert.equal(samples[0].stopReason, 'outerHorizon', 'the first ray, at the shadow edge, is captured');
  assert.ok(samples.slice(1).every((sample) => sample.stopReason === 'escapedToLarge' && Number.isFinite(sample.deflection)),
    samples.map((sample) => sample.stopReason).join(' '));
  // The larger step: the ray nearest the shadow, one further out and one leaving
  // outward against a step four times finer.
  for (const index of [1, 8, 24]) {
    const { angle, deflection } = samples[index];
    const initial = P.initialStateFromLocal(schwarzschild, {
      radius: cameraRadius, latitude: 0, azimuth: angle - 180, elevation: 0, speed: 1, massive: false, photonEnergy: 1
    });
    const fine = P.integrateGeodesic(schwarzschild, initial, { ...settings, step: settings.step / 4, maxSteps: 4 * settings.maxSteps });
    assert.equal(fine.stopReason, 'escapedToLarge');
    const gap = Math.abs(P.escapeDeflection(fine.finalState, angle) - deflection);
    assert.ok(gap < 1e-4, `sample ${index} at ${angle.toFixed(3)}°: deflection ${deflection}, off by ${gap}° from the finer step`);
  }
});
