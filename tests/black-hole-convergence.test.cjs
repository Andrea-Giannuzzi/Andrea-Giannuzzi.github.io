const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ window: {}, console });
for (const file of ['black-hole-physics.js', 'black-hole-simulation.js', 'content.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js', file), 'utf8'), context);
}
const P = context.window.KerrNewmanPhysics;
const S = context.window.BlackHoleSimulation;
const preset = (id) => S.run(S.presetConfiguration(id, 'physical'));
const position = ([, r, theta, phi]) => [
  r * Math.sin(theta) * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(theta)
];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('Samples sit at exact multiples of sampleEvery * step and carry their lambdas', () => {
  const params = { M: 1, a: 0.6, q: 0.3 };
  const state = P.initialStateFromConstants(params, {
    radius: 12, energy: 1, angularMomentum: 3, massive: false, radialDirection: 'ingoing'
  });
  const step = 0.01;
  const result = P.integrateGeodesic(params, state, { step, maxLambda: 1, maxSteps: 1000, sampleEvery: 4 });
  assert.equal(result.stopReason, 'maximumInterval');
  assert.equal(result.points.length, 26);
  assert.equal(result.sampleLambdas.length, result.points.length);
  result.sampleLambdas.forEach((lambda, n) => assert.equal(lambda, 4 * n * step));
  assert.ok(result.sampleLambdas[result.sampleLambdas.length - 1] <= result.lambda);
  // The last sample is the final state when the step count is a multiple of sampleEvery.
  assert.deepEqual(Array.from(result.points[result.points.length - 1]), Array.from(result.finalState));

  const sparse = P.integrateGeodesic(params, state, { step, maxLambda: 1, maxSteps: 1000, sampleEvery: 1000 });
  assert.equal(sparse.points.length, 1);
  assert.deepEqual(Array.from(sparse.sampleLambdas), [0]);
});

test('rk4Stages advances exactly as rk4Step and exposes the four stage derivatives', () => {
  const params = { M: 1, a: 0.7, q: 0.2 };
  const state = P.initialStateFromConstants(params, {
    radius: 9, energy: 0.97, angularMomentum: 3.4, massive: true, radialDirection: 'outgoing'
  });
  const stages = P.rk4Stages(params, state, 0.01);
  assert.deepEqual(Array.from(stages.next), Array.from(P.rk4Step(params, state, 0.01)));
  for (const key of ['k1', 'k2', 'k3', 'k4']) assert.equal(stages[key].length, 8, key);
  assert.deepEqual(Array.from(stages.k1), Array.from(P.geodesicRightHandSide(params, state)));
});

test('Step doubling gives order 4 and a Richardson estimate close to the true error', () => {
  for (const id of ['photonCapture', 'massiveInfall', 'massiveChargedInfall']) {
    const simulation = preset(id);
    const estimate = P.convergenceEstimate(simulation.params, simulation.initialState, simulation.result);
    assert.equal(estimate.status, 'reliable', `${id}: ${estimate.reason}`);
    assert.ok(estimate.order > 3.5 && estimate.order < 4.5, `${id}: p = ${estimate.order}`);
    // True error of the run at h on the same lambda grid, against a run at h/8.
    const { settings } = simulation.result;
    const reference = P.integrateGeodesic(simulation.params, simulation.initialState, {
      ...settings, step: settings.step / 8, maxSteps: 8 * settings.maxSteps
    });
    let trueError = 0;
    for (let k = 1; k <= estimate.samples; k += 1) {
      trueError = Math.max(trueError, distance(position(simulation.result.points[4 * k]), position(reference.points[32 * k])));
    }
    const ratio = estimate.errorEstimate / trueError;
    assert.ok(ratio > 0.5 && ratio < 2, `${id}: estimate/true = ${ratio}`);
  }
});

test('A stable circular orbit stays at round-off and is reported as an upper bound, not a failure', () => {
  const simulation = preset('massiveCircular');
  const estimate = P.convergenceEstimate(simulation.params, simulation.initialState, simulation.result);
  assert.equal(estimate.status, 'roundOff');
  assert.equal(estimate.errorEstimate, estimate.differences[0]);
});

test('The unstable circular photon orbit is never reported as a reliable estimate', () => {
  // Its round-off departure from the circular state grows exponentially, so
  // depending on the last bits of the state it reads as round-off (node) or as
  // an order far from 4 (Chrome, after the physical-unit conversion).
  const simulation = preset('photonSpherePrograde');
  const estimate = P.convergenceEstimate(simulation.params, simulation.initialState, simulation.result);
  assert.ok(['roundOff', 'unreliable'].includes(estimate.status), estimate.status);
  assert.equal(estimate.errorEstimate === null, estimate.status === 'unreliable');
});

test('Different stops, a budget stop and a too short run are classified', () => {
  const simulation = preset('photonCapture');
  const [at2h, at4h] = [2, 4].map((factor) => P.integrateCoarser(simulation.params, simulation.initialState, simulation.result, factor));
  const mismatch = P.convergenceEstimate(simulation.params, simulation.initialState, simulation.result,
    [at2h, { ...at4h, stopReason: 'escapedToLarge' }]);
  assert.equal(mismatch.reason, 'stopMismatch');

  // maximumSteps and maximumInterval count as the same stop.
  const scattering = preset('photonScattering');
  const [s2h, s4h] = [2, 4].map((factor) => P.integrateCoarser(scattering.params, scattering.initialState, scattering.result, factor));
  const budget = P.convergenceEstimate(scattering.params, scattering.initialState, scattering.result,
    [s2h, { ...s4h, stopReason: 'maximumSteps' }]);
  assert.equal(budget.status, 'reliable');

  const short = P.integrateGeodesic(simulation.params, simulation.initialState, { ...simulation.result.settings, maxLambda: 0.1 });
  assert.equal(P.convergenceEstimate(simulation.params, simulation.initialState, short).reason, 'tooShort');
});

test('The radial infall benchmark exposes four decreasing errors at RK4 order', () => {
  const benchmark = P.runScientificValidation().geodesicCases.find((entry) => entry.id === 'radialInfall');
  const points = Array.from(benchmark.convergence);
  assert.deepEqual(points.map((point) => point.step), [0.08, 0.04, 0.02, 0.01]);
  for (let i = 1; i < points.length; i += 1) {
    const order = Math.log2(points[i - 1].error / points[i].error);
    assert.ok(order > 3.5 && order < 4.5, `order between ${points[i - 1].step} and ${points[i].step}: ${order}`);
  }
});

test('Convergence and method copy exists in Italian and English', () => {
  for (const language of ['it', 'en']) {
    const copy = context.window.PORTFOLIO_CONTENT[language].blackHoleSimulator;
    for (const key of ['methodConvergenceTitle', 'methodConvergenceText', 'methodConvergenceLimits', 'firstRk4Step']) {
      assert.ok(copy[key], `${language}: ${key}`);
    }
    for (const key of ['order', 'error', 'upperBound', 'interval', 'pending', 'chartTitle', 'chartDesc', 'validationChartTitle', 'validationChartDesc']) {
      assert.ok(copy.convergence?.[key], `${language}: convergence.${key}`);
    }
    for (const reason of ['stopMismatch', 'orderOutOfRange', 'roundOff', 'tooShort']) {
      assert.ok(copy.convergence?.reasons?.[reason], `${language}: convergence.reasons.${reason}`);
    }
  }
});
