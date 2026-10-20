const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ window: {} });
for (const file of ['black-hole-physics.js', 'content.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js', file), 'utf8'), context);
}
const P = context.window.KerrNewmanPhysics;
const schwarzschild = { M: 1, a: 0, q: 0 };

// Composite 20-point Gauss-Legendre quadrature for the exact references below.
const gauss = (() => {
  const n = 20, nodes = [], weights = [];
  for (let i = 1; i <= n; i += 1) {
    let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), derivative;
    for (let iteration = 0; iteration < 100; iteration += 1) {
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= n; j += 1) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
      derivative = n * (z * p1 - p2) / (z * z - 1);
      const previous = z; z = previous - p1 / derivative;
      if (Math.abs(z - previous) < 1e-16) break;
    }
    nodes.push(z); weights.push(2 / ((1 - z * z) * derivative * derivative));
  }
  return { nodes, weights };
})();
const integrate = (f, a, b, panels) => {
  const width = (b - a) / panels;
  let sum = 0;
  for (let k = 0; k < panels; k += 1) {
    const middle = a + (k + 0.5) * width;
    gauss.nodes.forEach((node, i) => { sum += gauss.weights[i] * f(middle + 0.5 * width * node) * 0.5 * width; });
  }
  return sum;
};
const observedOrders = (errors) => errors.slice(1).map((error, i) => Math.log2(errors[i] / error));

// Escape direction measured exactly as computeLensingTable does.
function lensingDeflection(finalState, angle) {
  const [, r, , phi, , radialVelocity, , azimuthalVelocity] = finalState;
  const dX = radialVelocity * Math.cos(phi) - r * Math.sin(phi) * azimuthalVelocity;
  const dY = radialVelocity * Math.sin(phi) + r * Math.cos(phi) * azimuthalVelocity;
  return Math.atan2(dY, -dX) * 180 / Math.PI - angle;
}

// Schwarzschild (M = 1) photon launched inward from cameraRadius and observed
// outgoing at finalRadius: with u = 1/r, dphi/du = 1/sqrt(F) where
// F(u) = 1/b^2 - u^2 + 2u^3 = 2(u - up)(u - u2)(u - u3) and up = 1/periapsis.
// Substituting u = up - s^2 removes the turning-point singularity.
function exactSchwarzschildDeflection(constants, cameraRadius, finalRadius, angle) {
  const { energy, angularMomentum } = constants;
  const b = Math.abs(angularMomentum / energy);
  let up = 1 / b;
  for (let i = 0; i < 200; i += 1) {
    const next = up - (2 * up ** 3 - up * up + 1 / (b * b)) / (6 * up * up - 2 * up);
    if (Math.abs(next - up) < 1e-17) { up = next; break; }
    up = next;
  }
  const beta = up - 0.5, discriminant = Math.sqrt(beta * beta - 4 * beta * up);
  const u2 = (-beta + discriminant) / 2, u3 = (-beta - discriminant) / 2;
  const toPeriapsis = (u) => integrate((s) => 2 / Math.sqrt(2 * (u2 - up + s * s) * (up - s * s - u3)), 0, Math.sqrt(up - u), 200);
  const phi = Math.sign(angularMomentum) * (toPeriapsis(1 / cameraRadius) + toPeriapsis(1 / finalRadius));
  const radialVelocity = Math.sqrt(energy * energy - (1 - 2 / finalRadius) * angularMomentum ** 2 / finalRadius ** 2);
  return lensingDeflection([0, finalRadius, Math.PI / 2, phi, 0, radialVelocity, 0, angularMomentum / finalRadius ** 2], angle);
}

test('Every scientific-validation entry has Italian and English labels', () => {
  const report = P.runScientificValidation();
  const ids = ['analyticalCases', 'familyCases', 'tensorCases', 'geodesicCases', 'lensingCases']
    .flatMap((group) => report[group].map((entry) => entry.id));
  for (const language of ['it', 'en']) {
    const copy = context.window.PORTFOLIO_CONTENT[language].blackHoleSimulator.validation;
    for (const id of ids) assert.ok(copy.benchmarks[id], `${language}: benchmarks.${id}`);
    for (const benchmark of report.geodesicCases) {
      assert.ok(copy.geodesicNotes[benchmark.id], `${language}: geodesicNotes.${benchmark.id}`);
      for (const measurement of benchmark.measurements) {
        assert.ok(copy.measurements[measurement.id], `${language}: measurements.${measurement.id}`);
      }
    }
    assert.ok(copy.lensingTitle && copy.lensingNote, `${language}: lensing copy`);
    // Shown only when a benchmark throws, so the report above never lists it.
    assert.ok(copy.measurements.computationError, `${language}: measurements.computationError`);
  }
});

test('Weak-field deflection keeps its sign: the ray bends toward the hole', () => {
  const [check] = P.runScientificValidation().lensingCases;
  assert.ok(check.deflection < 0 && check.weakFieldReference < 0, `${check.deflection} vs ${check.weakFieldReference}`);
});

test('A check that throws fails on its own instead of aborting the validation run', () => {
  // Make the local-frame launch throw: only the two checks that use it may fail.
  const source = fs.readFileSync(path.join(__dirname, '../assets/js/black-hole-physics.js'), 'utf8');
  const signature = 'function initialStateFromLocal(params, options) {';
  assert.ok(source.includes(signature), 'initialStateFromLocal signature changed; update this test');
  const broken = vm.createContext({ window: {} });
  vm.runInContext(source.replace(
    signature, `${signature} throw Object.assign(new Error('forced'), { code: 'invalidLocalFrame' });`
  ), broken);
  const report = broken.window.KerrNewmanPhysics.runScientificValidation();
  assert.equal(report.passed, false);
  const failed = ['analyticalCases', 'familyCases', 'tensorCases', 'geodesicCases', 'lensingCases']
    .flatMap((group) => report[group].filter((entry) => !entry.passed).map((entry) => entry.id));
  // Arrays built inside the vm context have another realm's prototype, so compare copies.
  assert.deepEqual(Array.from(failed), ['kerrNewmanInclined', 'schwarzschildWeakFieldDeflection']);
  const inclined = report.geodesicCases.find((entry) => entry.id === 'kerrNewmanInclined');
  assert.equal(inclined.stopReason, 'invalidLocalFrame');
  assert.deepEqual(Array.from(inclined.measurements, (measurement) => measurement.id), ['computationError']);
  assert.equal(report.lensingCases[0].stopReason, 'invalidLocalFrame');
});

test('Lensing table deflection matches the exact Schwarzschild value at RK4 order', () => {
  // Sample 10 of the default 28-sample table, angle 60 (10/27)^2: at camera
  // radius 38 it is the escaped ray closest to the shadow, the hardest one.
  const cameraRadius = 38;
  const angle = 60 * (10 / 27) ** 2;
  const table = P.computeLensingTable(schwarzschild, { cameraRadius, samples: 2, maxAngle: angle });
  const sample = table.samples[1];
  assert.equal(sample.angle, angle);
  assert.equal(sample.stopReason, 'escapedToLarge');
  const initial = P.initialStateFromLocal(schwarzschild, {
    radius: cameraRadius, latitude: 0, azimuth: 180 - angle, elevation: 0, speed: 1, massive: false, photonEnergy: 1
  });
  const constants = P.conservedQuantities(schwarzschild, initial);
  const rerun = P.integrateGeodesic(schwarzschild, initial, table.settings);
  assert.equal(lensingDeflection(rerun.finalState, angle), sample.deflection);
  const exact = exactSchwarzschildDeflection(constants, cameraRadius, rerun.finalState[1], angle);
  const relativeError = Math.abs(sample.deflection - exact) / Math.abs(exact);
  assert.ok(relativeError < 1e-5, `production-step relative error ${relativeError}`);

  const errors = [0.6, 0.3, 0.15].map((step) => {
    const result = P.integrateGeodesic(schwarzschild, initial, {
      ...table.settings, step, maxSteps: Math.ceil(table.settings.maxLambda / step)
    });
    assert.equal(result.stopReason, 'escapedToLarge');
    const reference = exactSchwarzschildDeflection(constants, cameraRadius, result.finalState[1], angle);
    return Math.abs(lensingDeflection(result.finalState, angle) - reference);
  });
  for (const order of observedOrders(errors)) assert.ok(order > 3.5 && order < 4.5, `orders ${observedOrders(errors)}`);
});

test('Kerr-Newman equatorial infall matches the quadrature reference at RK4 order', () => {
  // E = 1, L_z = 0 on the equator: (dr/dlambda)^2 = (r^2 + a^2)(2Mr - q^2)/r^4,
  // so lambda(r) = integral from r to r0 of s^2 / sqrt((s^2 + a^2)(2s - q^2)).
  const params = { M: 1, a: 0.7, q: 0.3 };
  const startRadius = 20;
  const affineParameterAt = (radius) => integrate(
    (s) => s * s / Math.sqrt((s * s + params.a ** 2) * (2 * s - params.q ** 2)), radius, startRadius, 400
  );
  const maxLambda = Math.round(affineParameterAt(2.2) * 100) / 100; // ends near r = 2.2, outside r+ = 1.648
  const state = P.initialStateFromConstants(params, {
    radius: startRadius, energy: 1, angularMomentum: 0, massive: true, radialDirection: 'ingoing'
  });
  const errors = [0.04, 0.02, 0.01].map((step) => {
    const steps = Math.ceil(maxLambda / step);
    const result = P.integrateGeodesic(params, state, { step, maxLambda, maxSteps: steps, sampleEvery: steps });
    assert.equal(result.stopReason, 'maximumInterval');
    return Math.abs(affineParameterAt(result.finalState[1]) - steps * step);
  });
  assert.ok(errors[2] < 1e-8, `error at the production step ${errors[2]}`);
  for (const order of observedOrders(errors)) assert.ok(order > 3.5 && order < 4.5, `orders ${observedOrders(errors)}`);
});
