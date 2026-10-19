const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/black-hole-physics.js'), 'utf8'), context);
const P = context.window.KerrNewmanPhysics;

const kerrNewman = { M: 1, a: 0.6, q: 0.5 };
const close = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected} (tolerance ${tolerance})`);
const extent = (points, key) => Math.max(...points.map((p) => p[key])) - Math.min(...points.map((p) => p[key]));

// Inverse of Bardeen's map (Perlick & Tsupko 2022, eq. 57): xi = -alpha sin(theta_o)
// and, since xi^2 cot^2(theta_o) = alpha^2 cos^2(theta_o), eta = beta^2 + (alpha^2 - a^2) cos^2(theta_o).
function constantsFromSky(params, alpha, beta, inclination) {
  const cosI = Math.cos(inclination);
  return { xi: -alpha * Math.sin(inclination), eta: beta * beta + (alpha * alpha - params.a ** 2) * cosI * cosI };
}

// ZAMO launch with prescribed (xi, eta), through the existing initialStateFromLocal.
// With unit local energy and direction n, that tetrad gives L_z = sqrt(g_phiphi) n_phi,
// E = N + omega L_z and p_theta = sqrt(g_thetatheta) n_theta. Hence E = N / (1 - omega xi),
// n_phi = xi E / sqrt(g_phiphi) and, from Carter's p_theta^2 = Theta = E^2 beta^2
// (thesis eq. 9.26), |n_theta| = E beta / sqrt(g_thetatheta).
function launchFromConstants(params, { radius, theta, xi, eta, radialSign, polarSign }) {
  const frame = P.zamoFrame(params, radius, theta);
  const energy = frame.lapse / (1 - frame.omega * xi);
  const betaSquared = eta + (params.a * Math.cos(theta)) ** 2 - (xi / Math.tan(theta)) ** 2;
  const nPhi = xi * energy / frame.azimuthalScale;
  const nTheta = polarSign * Math.sqrt(Math.max(0, betaSquared)) * energy / frame.polarScale;
  const radialSquared = 1 - nPhi * nPhi - nTheta * nTheta;
  const nR = radialSign * Math.sqrt(Math.max(0, radialSquared));
  const state = P.initialStateFromLocal(params, {
    radius, latitude: 90 - theta * 180 / Math.PI, azimuth: Math.atan2(nPhi, nR) * 180 / Math.PI,
    elevation: Math.asin(-nTheta) * 180 / Math.PI, speed: 1, massive: false, photonEnergy: 1
  });
  return { radialSquared, state };
}

test('Schwarzschild shadow is the circle of radius 3*sqrt(3) M for every inclination', () => {
  // Perlick & Tsupko 2022, eq. (8).
  for (const inclination of [Math.PI / 6, Math.PI / 3, Math.PI / 2, 5 * Math.PI / 6]) {
    const contour = P.shadowContour({ M: 1, a: 0, q: 0 }, inclination);
    for (const point of contour.points) close(Math.hypot(point.alpha, point.beta), 3 * Math.sqrt(3), 1e-12);
  }
});

test('Reissner-Nordstrom shadow is the circle of radius r_ph / sqrt(f(r_ph))', () => {
  // Closed form of b_cr^2, Perlick & Tsupko 2022, eq. (36).
  for (const q of [0.5, 0.9]) {
    const root = Math.sqrt(9 - 8 * q * q);
    const critical = Math.sqrt((3 + root) ** 4 / (8 * (3 - 2 * q * q + root)));
    for (const inclination of [Math.PI / 4, Math.PI / 2]) {
      const contour = P.shadowContour({ M: 1, a: 0, q }, inclination);
      for (const point of contour.points) close(Math.hypot(point.alpha, point.beta), critical, 1e-12);
    }
  }
});

test('Critical constants match Takahashi (Kerr-Newman) and Perlick-Tsupko (Kerr) independently', () => {
  // Takahashi 2005, eqs. (6)-(7): polynomial form, independent of the
  // Grenzebach et al. form used in criticalImpactParameters.
  const takahashi = ({ M, a, q }, r) => ({
    xi: (-(r ** 3) + 3 * M * r * r - a * a * r - M * a * a - 2 * q * q * r) / (a * (r - M)),
    eta: (r ** 3 * (-(r ** 3) + 6 * M * r * r - 9 * M * M * r + 4 * M * a * a)
      - 4 * r * r * q * q * (r * r + a * a + q * q - 3 * M * r)) / (a * a * (r - M) ** 2)
  });
  // Perlick & Tsupko 2022, eq. (58), Kerr only.
  const kerrForm = ({ M, a }, r) => ({
    xi: (-r * r * (r - 3 * M) - a * a * (r + M)) / (a * (r - M)),
    eta: r ** 3 * (4 * a * a * M - r * (r - 3 * M) ** 2) / (a * a * (r - M) ** 2)
  });
  for (const params of [kerrNewman, { M: 1, a: 0.3, q: 0.9 }, { M: 1, a: -0.7, q: 0.4 }]) {
    for (const r of [2.0, 2.6, 3.3]) {
      const actual = P.criticalImpactParameters(params, r);
      const expected = takahashi(params, r);
      close(actual.xi, expected.xi, 1e-12 * Math.max(1, Math.abs(expected.xi)));
      close(actual.eta, expected.eta, 1e-12 * Math.max(1, Math.abs(expected.eta)));
    }
  }
  for (const r of [1.5, 2.8, 3.9]) {
    const params = { M: 1, a: 0.9, q: 0 };
    const actual = P.criticalImpactParameters(params, r);
    const expected = kerrForm(params, r);
    close(actual.xi, expected.xi, 1e-12 * Math.max(1, Math.abs(expected.xi)));
    close(actual.eta, expected.eta, 1e-12 * Math.max(1, Math.abs(expected.eta)));
  }
  // Without spin only xi^2 + eta is defined; invalid requests stay explicit.
  assert.equal(P.criticalImpactParameters({ M: 1, a: 0, q: 0.5 }, 2.7), null);
  assert.throws(() => P.criticalImpactParameters(kerrNewman, 1), { code: 'invalidPhotonOrbit' });
  assert.throws(() => P.criticalImpactParameters(kerrNewman, 1.2), { code: 'invalidPhotonOrbit' }, 'between the horizons');
  assert.throws(() => P.celestialCoordinates(kerrNewman, 1, 1, 0), { code: 'invalidCelestialRequest' });
  assert.equal(P.celestialCoordinates(kerrNewman, 5, 0, Math.PI / 4).beta, null);
  assert.equal(P.shadowContour({ M: 1, a: 0.9, q: 0.6 }, Math.PI / 2), null, 'naked singularity');
  // 25 - 9 - 16 is exactly zero in floating point; 1 - 0.36 - 0.64 is not.
  const extremal = { M: 5, a: 3, q: 4 };
  assert.equal(P.horizonData(extremal).extremality, 0);
  assert.equal(P.shadowContour(extremal, Math.PI / 2), null, 'extremal spinning hole');
});

test('Kerr-Newman contour tends to the Reissner-Nordstrom circle as a -> 0, with O(a^2) error', () => {
  const q = 0.6;
  const rph = P.photonSphereRadius({ M: 1, a: 0, q });
  const critical = rph / Math.sqrt(1 - 2 / rph + q * q / (rph * rph));
  for (const a of [1e-2, 1e-3, 1e-4]) {
    const { points } = P.shadowContour({ M: 1, a, q }, Math.PI / 3, 2001);
    close(extent(points, 'alpha') / 2, critical, a * a);
    close(Math.max(...points.map((p) => p.beta)), critical, a * a);
  }
});

test('Contour is mirror-symmetric in beta and identical for theta_o and pi - theta_o', () => {
  const samples = 64;
  const above = P.shadowContour(kerrNewman, Math.PI / 3, samples);
  const below = P.shadowContour(kerrNewman, 2 * Math.PI / 3, samples);
  assert.equal(above.points.length, 2 * samples - 2);
  above.points.forEach((point, i) => {
    close(below.points[i].alpha, point.alpha, 1e-9);
    close(below.points[i].beta, point.beta, 1e-9);
  });
  for (let i = 1; i < samples - 1; i += 1) {
    const mirror = above.points[2 * samples - 2 - i];
    close(mirror.alpha, above.points[i].alpha, 0);
    close(mirror.beta, -above.points[i].beta, 0);
  }
  // The upper half runs from the smallest-alpha end to the largest for either
  // sign of the spin, like the circle without spin.
  for (const params of [kerrNewman, { ...kerrNewman, a: -kerrNewman.a }, { M: 1, a: 0, q: 0.5 }]) {
    const alphas = P.shadowContour(params, Math.PI / 3, samples).points.map((p) => p.alpha);
    assert.equal(alphas[0], Math.min(...alphas));
    assert.equal(alphas[samples - 1], Math.max(...alphas));
  }
});

test('Near-extremal Kerr matches the literature: 9M x 6*sqrt(3)M edge-on, 4(1+sqrt(2))M pole-on', () => {
  // Perlick & Tsupko 2022, Table III: horizontal diameter 9M at a = M,
  // theta_o = pi/2 (Bardeen 1973; Chandrasekhar 1983); vertical diameter
  // 6*sqrt(3)M edge-on for any spin (Zakharov et al.); 4(1+sqrt(2))M pole-on.
  const nearExtremal = { M: 1, a: 1 - 1e-8, q: 0 };
  const edgeOn = P.shadowContour(nearExtremal, Math.PI / 2, 4001).points;
  close(Math.min(...edgeOn.map((p) => p.alpha)), -2, 1e-3);
  close(Math.max(...edgeOn.map((p) => p.alpha)), 7, 1e-6);
  close(extent(edgeOn, 'alpha'), 9, 1e-3);
  close(extent(edgeOn, 'beta'), 6 * Math.sqrt(3), 1e-6);
  close(extent(P.shadowContour({ M: 1, a: 0.5, q: 0 }, Math.PI / 2, 4001).points, 'beta'), 6 * Math.sqrt(3), 1e-6);
  const poleOn = P.shadowContour(nearExtremal, 1e-3, 4001).points;
  close(extent(poleOn, 'alpha'), 4 * (1 + Math.SQRT2), 1e-3);
  close(extent(poleOn, 'beta'), 4 * (1 + Math.SQRT2), 1e-3);

  // Extremal edge-on curve beta^2 = 2 alpha M + 11 M^2 + 8 M sqrt(M(2M + alpha)) - alpha^2
  // (Perlick & Tsupko 2022, eq. 65; Chandrasekhar 1983, pp. 357-358), away
  // from the straight edge at alpha = -2M; the gap closes like sqrt(M - a).
  const gap = (a) => {
    let worst = 0;
    for (const p of P.shadowContour({ M: 1, a, q: 0 }, Math.PI / 2, 4001).points) {
      if (p.alpha < -1.9) continue;
      const betaSquared = 2 * p.alpha + 11 + 8 * Math.sqrt(2 + p.alpha) - p.alpha ** 2;
      worst = Math.max(worst, Math.abs(Math.sqrt(Math.max(0, betaSquared)) - Math.abs(p.beta)));
    }
    return worst;
  };
  const coarse = gap(1 - 1e-6);
  const fine = gap(1 - 1e-8);
  assert.ok(fine < 1e-3, `extremal curve gap ${fine}`);
  assert.ok(fine < coarse / 5, `gap must shrink toward extremality: ${coarse} -> ${fine}`);
});

test('Photons just outside the Kerr-Newman contour escape and just inside are captured, for both signs of beta', () => {
  // Scaling (alpha, beta) about the origin is meaningful because the origin is
  // inside the shadow: xi = 0, eta = -a^2 cos^2(theta_o) gives
  // R(r) = (r^2 + a^2)^2 - Delta a^2 sin^2(theta_o) > 0 outside the horizon.
  const settings = { step: 0.05, maxLambda: 400, maxSteps: 8000, sampleEvery: 8000, escapeRadius: 80 };
  for (const inclination of [Math.PI / 2, Math.PI / 3]) {
    const contour = P.shadowContour(kerrNewman, inclination, 9);
    for (const point of [contour.points[1], contour.points[4], contour.points[7]]) {
      for (const [scale, expected] of [[1.01, 'escapedToLarge'], [0.99, 'outerHorizon']]) {
        for (const betaSign of [1, -1]) {
          const { xi, eta } = constantsFromSky(kerrNewman, scale * point.alpha, betaSign * scale * point.beta, inclination);
          const { state } = launchFromConstants(kerrNewman, { radius: 40, theta: inclination, xi, eta, radialSign: -1, polarSign: betaSign });
          // Also checks that conservedQuantities' Carter constant is the Q of eta.
          const constants = P.conservedQuantities(kerrNewman, state);
          close(constants.angularMomentum / constants.energy, xi, 1e-12);
          close(constants.carter / constants.energy ** 2, eta, 1e-12 * Math.max(1, eta));
          const { stopReason } = P.integrateGeodesic(kerrNewman, state, settings);
          assert.equal(stopReason, expected, `r_p ${point.rp}, scale ${scale}, beta sign ${betaSign}`);
        }
      }
    }
  }
});

test('Critical constants define spherical photon orbits: no radial momentum, constant r', () => {
  for (const [params, rp] of [[kerrNewman, 2.6], [{ M: 1, a: 0.9, q: 0.2 }, 2.0], [{ M: 1, a: 0.9, q: 0.2 }, 3.5]]) {
    const { xi, eta } = P.criticalImpactParameters(params, rp);
    const { radialSquared, state } = launchFromConstants(params, { radius: rp, theta: Math.PI / 2, xi, eta, radialSign: 1, polarSign: 1 });
    close(radialSquared, 0, 1e-12);
    const result = P.integrateGeodesic(params, state, { step: 0.005, maxLambda: 15, maxSteps: 3000, sampleEvery: 1 });
    assert.equal(result.stopReason, 'maximumInterval');
    for (const point of result.points) close(point[1], rp, 1e-5);
  }
});

test('Far ZAMO launch angles map onto Bardeen alpha, beta: alpha ~ -r cos(el) sin(az), beta ~ r sin(el)', () => {
  // A ray emitted toward the black hole has the constants of the photon the
  // camera receives from the mirrored direction (phi -> -phi), hence the minus
  // sign in alpha. The relative gap is O(M/r): lapse and frame dragging at the camera.
  const radius = 1e4;
  const inclination = Math.PI / 3;
  for (const [azimuth, elevation] of [[179.97, 0.01], [-179.98, -0.02], [179.99, 0.025]]) {
    const state = P.initialStateFromLocal(kerrNewman, {
      radius, latitude: 30, azimuth, elevation, speed: 1, massive: false, photonEnergy: 1
    });
    const constants = P.conservedQuantities(kerrNewman, state);
    const sky = P.celestialCoordinates(kerrNewman, constants.angularMomentum / constants.energy,
      constants.carter / constants.energy ** 2, inclination);
    const az = azimuth * Math.PI / 180;
    const el = elevation * Math.PI / 180;
    close(sky.alpha / (-radius * Math.cos(el) * Math.sin(az)), 1, 2 / radius);
    close(sky.beta / (radius * Math.abs(Math.sin(el))), 1, 2 / radius);
    // Exact at any radius: beta^2 = Theta(theta_o)/E^2 = p_theta^2/E^2 (thesis eq. 9.26).
    const polarMomentum = P.metric(kerrNewman, radius, inclination)[2][2] * state[6];
    close(sky.beta, Math.abs(polarMomentum) / constants.energy, 1e-9 * sky.beta);
  }
});
