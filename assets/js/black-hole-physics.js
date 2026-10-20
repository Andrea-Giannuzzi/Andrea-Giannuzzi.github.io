/*
 * Kerr-Newman geodesics in Boyer-Lindquist coordinates, signature (-+++).
 * The numerical solver always uses M = 1 after conversion to geometrized units.
 * This file deliberately keeps tensor construction separate from the UI.
 */
(function () {
  "use strict";

  const SI = Object.freeze({
    G: 6.67430e-11,
    c: 299792458,
    epsilon0: 8.8541878128e-12,
    solarMass: 1.98847e30
  });

  const NUMERICS = Object.freeze({
    step: 0.01,
    maxLambda: 80,
    maxSteps: 12000,
    sampleEvery: 4,
    horizonMargin: 1.2e-1,
    singularityRadius: 5e-2,
    tolerance: 1e-10
  });

  // Central tolerances for controlled regression checks. They are deliberately
  // looser than machine precision while remaining strict for the current RK4.
  const VALIDATION_TOLERANCES = Object.freeze({
    analyticalAbsolute: 1e-12,
    tensorResidual: 1e-12,
    christoffelSymmetry: 1e-12,
    relativeRadialDrift: 1e-8,
    normalization: 1e-10,
    relativeConservation: 1e-10,
    equatorialDrift: 1e-10,
    // RK4 at VALIDATION_INTEGRATION.infallStep (0.01) lands at 2.5e-13 (r) and
    // 1.5e-12 (t) against the radial infall closed form; a third-order method
    // reaches ~1e-9 and fails here. Re-measure this bound if that step changes.
    analyticalInfallRelative: 1e-11,
    // Observed order log2(e(2h)/e(h)) must lie within 4 ± 0.5 for RK4.
    convergenceOrder: 0.5,
    // Deliberately loose: this checks a weak-field deflection against the
    // leading-order formula -4M/b (bending toward the hole), itself only an
    // approximation (see computeLensingTable). A physical sanity bound, not
    // a numerical-precision one.
    lensingWeakFieldRelative: 0.02
  });

  const VALIDATION_INTEGRATION = Object.freeze({
    step: 0.01,
    photonMaxLambda: 10,
    massiveMaxLambda: 20,
    infallMaxLambda: 12,
    // Its own step: below h ≈ 0.005 the infall error reaches the round-off
    // floor (~3e-14) and the observed order stops measuring RK4.
    infallStep: 0.01,
    sampleEvery: 1,
    maxSteps: 4000
  });

  const zeroMatrix = () => Array.from({ length: 4 }, () => Array(4).fill(0));
  const cloneMatrix = (matrix) => matrix.map((row) => row.slice());
  const physicsError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
  };

  function physicalToGeometrized({ massSolar, chargeC, angularMomentum }) {
    const massKg = massSolar * SI.solarMass;
    const massMeters = SI.G * massKg / (SI.c * SI.c);
    const chargeMeters = Math.sqrt(SI.G / (4 * Math.PI * SI.epsilon0))
      * chargeC / (SI.c * SI.c);
    const angularMomentumMeters2 = SI.G * angularMomentum / Math.pow(SI.c, 3);
    const aMeters = angularMomentumMeters2 / massMeters;

    return {
      massKg,
      massMeters,
      chargeMeters,
      angularMomentumMeters2,
      aMeters,
      aStar: aMeters / massMeters,
      qStar: chargeMeters / massMeters
    };
  }

  function geometrizedToPhysical({ massKm, chargeKm, angularMomentumKm2 }) {
    const massMeters = massKm * 1000;
    const chargeMeters = chargeKm * 1000;
    const angularMomentumMeters2 = angularMomentumKm2 * 1e6;
    const massKg = massMeters * SI.c * SI.c / SI.G;
    const chargeC = chargeMeters * SI.c * SI.c
      / Math.sqrt(SI.G / (4 * Math.PI * SI.epsilon0));
    const angularMomentum = angularMomentumMeters2 * Math.pow(SI.c, 3) / SI.G;

    return {
      massSolar: massKg / SI.solarMass,
      massKg,
      chargeC,
      angularMomentum
    };
  }

  function angularMomentumForSpin(massSolar, aStar) {
    const massKg = massSolar * SI.solarMass;
    return aStar * SI.G * massKg * massKg / SI.c;
  }

  function dimensionlessParameters(physical) {
    const geometry = physicalToGeometrized(physical);
    if (!(geometry.massMeters > 0) || !Number.isFinite(geometry.massMeters)) {
      throw physicsError("invalidMass", "Mass must be finite and positive.");
    }
    return { M: 1, a: geometry.aStar, q: geometry.qStar, geometry };
  }

  function classifySpacetime(hasCharge, hasSpin) {
    if (!hasCharge && !hasSpin) return "schwarzschild";
    if (hasCharge && !hasSpin) return "reissnerNordstrom";
    if (!hasCharge && hasSpin) return "kerr";
    return "kerrNewman";
  }

  function detectSpacetime(params, tolerance = 1e-9) {
    return classifySpacetime(
      Math.abs(params.q) > tolerance,
      Math.abs(params.a) > tolerance
    );
  }

  function horizonData(params) {
    const extremality = params.M * params.M - params.a * params.a - params.q * params.q;
    if (extremality < 0) {
      return { extremality, hasHorizon: false, outer: null, inner: null };
    }
    const root = Math.sqrt(Math.max(0, extremality));
    return {
      extremality,
      hasHorizon: true,
      outer: params.M + root,
      inner: params.M - root
    };
  }

  function geometryProperties(params, spacetime = detectSpacetime(params)) {
    const horizons = horizonData(params);
    const staticDiscriminant = params.M * params.M - params.q * params.q;
    const outerStaticLimit = staticDiscriminant >= 0
      ? params.M + Math.sqrt(staticDiscriminant)
      : null;
    return {
      spacetime,
      ...horizons,
      outerStaticLimit,
      orbitInfo: horizons.hasHorizon
        ? circularOrbitInformation(params, spacetime)
        : { isco: "N/A", photon: "N/A" }
    };
  }

  // General (theta-dependent) outer static-limit radius: the ergosphere
  // boundary in Boyer-Lindquist coordinates, where g_tt = 0. This is the
  // same formula geometryProperties().outerStaticLimit uses, generalized
  // from the equatorial case (theta = pi/2, where cos(theta) = 0 drops the
  // spin term entirely) to any polar angle. At the poles (theta = 0 or pi)
  // it reduces exactly to the outer horizon radius -- the ergosphere is
  // tangent to the horizon there, a standard check used in validation.
  function outerStaticLimitAtTheta(params, theta) {
    const discriminant = params.M * params.M
      - params.a * params.a * Math.cos(theta) * Math.cos(theta)
      - params.q * params.q;
    return discriminant >= 0 ? params.M + Math.sqrt(discriminant) : null;
  }

  // Numeric ISCO / photon-sphere radii, in M-units, exposed so callers (the
  // disk geometry in particular) can place features exactly rather than by
  // display-string convention. Schwarzschild and Kerr use their standard
  // closed forms (Kerr via the Bardeen-Press-Teukolsky z1/z2 construction).
  // Reissner-Nordstrom exposes only the photon orbit (its ISCO has no simple
  // closed form and is not implemented here). Kerr-Newman (both spin and
  // charge nonzero) has no closed form in this module: both return null.
  function iscoRadius(params, sense = "prograde", type = detectSpacetime(params)) {
    if (type === "schwarzschild") return 6;
    if (type === "kerr") {
      const spin = Math.min(Math.abs(params.a), 1);
      const z1 = 1 + Math.cbrt(1 - spin * spin)
        * (Math.cbrt(1 + spin) + Math.cbrt(1 - spin));
      const z2 = Math.sqrt(3 * spin * spin + z1 * z1);
      const radical = Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
      return sense === "retrograde" ? 3 + z2 + radical : 3 + z2 - radical;
    }
    return null;
  }

  function photonSphereRadius(params, sense = "prograde", type = detectSpacetime(params)) {
    if (type === "schwarzschild") return 3;
    if (type === "reissnerNordstrom") {
      const discriminant = 9 - 8 * params.q * params.q;
      return discriminant >= 0 ? (3 + Math.sqrt(discriminant)) / 2 : null;
    }
    if (type === "kerr") {
      const spin = Math.min(Math.abs(params.a), 1);
      return sense === "retrograde"
        ? 2 * (1 + Math.cos((2 / 3) * Math.acos(spin)))
        : 2 * (1 + Math.cos((2 / 3) * Math.acos(-spin)));
    }
    return null;
  }

  function formatOrbitPair(prograde, retrograde) {
    return `prograde ${prograde.toFixed(6)} M; retrograde ${retrograde.toFixed(6)} M`;
  }

  function circularOrbitInformation(params, type = detectSpacetime(params)) {
    if (type === "kerr") {
      return {
        isco: formatOrbitPair(iscoRadius(params, "prograde", type), iscoRadius(params, "retrograde", type)),
        photon: formatOrbitPair(photonSphereRadius(params, "prograde", type), photonSphereRadius(params, "retrograde", type))
      };
    }
    const isco = iscoRadius(params, "prograde", type);
    const photon = photonSphereRadius(params, "prograde", type);
    return {
      isco: isco !== null ? `${isco.toFixed(6)} M` : "N/A",
      photon: photon !== null ? `${photon.toFixed(6)} M` : "N/A"
    };
  }

  function metric(params, r, theta) {
    const { M, a, q } = params;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const sin2 = sinTheta * sinTheta;
    const sigma = r * r + a * a * cosTheta * cosTheta;
    const delta = r * r - 2 * M * r + a * a + q * q;
    const source = 2 * M * r - q * q;
    if (!Number.isFinite(sigma) || !Number.isFinite(delta) || sigma <= 1e-14 || Math.abs(delta) <= 1e-14) {
      throw physicsError("invalidMetric", "Singular or invalid Boyer-Lindquist metric state.");
    }

    const g = zeroMatrix();
    const sourceOverSigma = source / sigma;
    g[0][0] = -(1 - sourceOverSigma);
    g[0][3] = -a * sourceOverSigma * sin2;
    g[3][0] = g[0][3];
    g[1][1] = sigma / delta;
    g[2][2] = sigma;
    g[3][3] = (r * r + a * a + a * a * sourceOverSigma * sin2) * sin2;
    return g;
  }

  function metricDerivatives(params, r, theta) {
    const { M, a, q } = params;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const sin2 = sinTheta * sinTheta;
    const dSin2Theta = 2 * sinTheta * cosTheta;
    const sigma = r * r + a * a * cosTheta * cosTheta;
    const delta = r * r - 2 * M * r + a * a + q * q;
    const source = 2 * M * r - q * q;
    const dSigmaR = 2 * r;
    const dSigmaTheta = -2 * a * a * sinTheta * cosTheta;
    const dDeltaR = 2 * r - 2 * M;
    const sourceOverSigma = source / sigma;
    const dSourceOverSigmaR = (2 * M * sigma - source * dSigmaR) / (sigma * sigma);
    const dSourceOverSigmaTheta = -source * dSigmaTheta / (sigma * sigma);
    const derivatives = Array.from({ length: 4 }, zeroMatrix);
    const dr = derivatives[1];
    const dTheta = derivatives[2];

    dr[0][0] = dSourceOverSigmaR;
    dr[0][3] = -a * dSourceOverSigmaR * sin2;
    dr[3][0] = dr[0][3];
    dr[1][1] = (dSigmaR * delta - sigma * dDeltaR) / (delta * delta);
    dr[2][2] = dSigmaR;
    dr[3][3] = (2 * r + a * a * dSourceOverSigmaR * sin2) * sin2;

    dTheta[0][0] = dSourceOverSigmaTheta;
    dTheta[0][3] = -a * (dSourceOverSigmaTheta * sin2 + sourceOverSigma * dSin2Theta);
    dTheta[3][0] = dTheta[0][3];
    dTheta[1][1] = dSigmaTheta / delta;
    dTheta[2][2] = dSigmaTheta;
    const azimuthalBracket = r * r + a * a + a * a * sourceOverSigma * sin2;
    const dAzimuthalBracket = a * a
      * (dSourceOverSigmaTheta * sin2 + sourceOverSigma * dSin2Theta);
    dTheta[3][3] = dAzimuthalBracket * sin2 + azimuthalBracket * dSin2Theta;

    return derivatives;
  }

  function inverseMetric(matrix) {
    const augmented = matrix.map((row, rowIndex) => [
      ...row,
      ...Array.from({ length: 4 }, (_, columnIndex) => rowIndex === columnIndex ? 1 : 0)
    ]);

    for (let column = 0; column < 4; column += 1) {
      let pivotRow = column;
      for (let row = column + 1; row < 4; row += 1) {
        if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) pivotRow = row;
      }
      if (Math.abs(augmented[pivotRow][column]) < 1e-14) {
        throw physicsError("nonInvertibleMetric", "Metric is not invertible.");
      }
      [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];

      const pivot = augmented[column][column];
      for (let entry = 0; entry < 8; entry += 1) augmented[column][entry] /= pivot;
      for (let row = 0; row < 4; row += 1) {
        if (row === column) continue;
        const factor = augmented[row][column];
        for (let entry = 0; entry < 8; entry += 1) {
          augmented[row][entry] -= factor * augmented[column][entry];
        }
      }
    }
    return augmented.map((row) => row.slice(4));
  }

  function christoffelSymbols(params, r, theta) {
    const g = metric(params, r, theta);
    const gInverse = inverseMetric(g);
    const derivatives = metricDerivatives(params, r, theta);
    const gamma = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => Array(4).fill(0)));

    // Γ^μ_{αβ} = 1/2 g^{μν}(∂αg_{νβ} + ∂βg_{να} - ∂νg_{αβ}).
    for (let mu = 0; mu < 4; mu += 1) {
      for (let alpha = 0; alpha < 4; alpha += 1) {
        for (let beta = 0; beta < 4; beta += 1) {
          let contraction = 0;
          for (let nu = 0; nu < 4; nu += 1) {
            contraction += gInverse[mu][nu] * (
              derivatives[alpha][nu][beta]
              + derivatives[beta][nu][alpha]
              - derivatives[nu][alpha][beta]
            );
          }
          gamma[mu][alpha][beta] = 0.5 * contraction;
        }
      }
    }
    return gamma;
  }

  function metricContraction(g, vector) {
    let value = 0;
    for (let mu = 0; mu < 4; mu += 1) {
      for (let nu = 0; nu < 4; nu += 1) value += g[mu][nu] * vector[mu] * vector[nu];
    }
    return value;
  }

  function conservedQuantities(params, state) {
    const g = metric(params, state[1], state[2]);
    const velocity = state.slice(4, 8);
    const energy = -(g[0][0] * velocity[0] + g[0][3] * velocity[3]);
    const angularMomentum = g[3][0] * velocity[0] + g[3][3] * velocity[3];
    const normalization = metricContraction(g, velocity);
    const polarMomentum = g[2][2] * velocity[2];
    // Carter Q is distinct from the electric charge q of the background.
    const carter = polarMomentum * polarMomentum + Math.cos(state[2]) ** 2 * (
      params.a ** 2 * (-normalization - energy ** 2)
      + angularMomentum ** 2 / Math.sin(state[2]) ** 2
    );
    return { energy, angularMomentum, normalization, carter };
  }

  // Equatorial circular-orbit angular velocity, derived directly from the
  // metric rather than a Newtonian approximation. For a stationary,
  // axisymmetric metric the circular-orbit condition partial_r(g_tt + 2*Omega*g_tphi
  // + Omega^2*g_phiphi) = 0 gives Omega = (-dg_tphi +/- sqrt(dg_tphi^2 - dg_tt*dg_phiphi)) / dg_phiphi,
  // independent of the orbit's timelike/null normalization. It reduces to the
  // Schwarzschild Omega = sqrt(M/r^3) and Kerr Omega = sqrt(M)/(r^1.5 +/- a*sqrt(M))
  // closed forms, both checked in runScientificValidation. Returns null where
  // no real circular orbit exists at this radius (inside the photon region).
  function keplerianAngularVelocity(params, radius, sense = "prograde") {
    const derivatives = metricDerivatives(params, radius, Math.PI / 2);
    const dr = derivatives[1];
    const discriminant = dr[0][3] * dr[0][3] - dr[0][0] * dr[3][3];
    if (!(discriminant >= 0) || dr[3][3] === 0) return null;
    const sign = sense === "retrograde" ? -1 : 1;
    const omega = (-dr[0][3] + sign * Math.sqrt(discriminant)) / dr[3][3];
    return Number.isFinite(omega) ? omega : null;
  }

  // Full 4-velocity data for a circular equatorial orbit: u^mu = u^t(1,0,0,Omega),
  // normalized via g_uv u^u u^v = -1, then converted to the conserved
  // energy and axial angular momentum per unit mass (E = -(g_tt + Omega*g_tphi)*u^t,
  // L = (g_tphi + Omega*g_phiphi)*u^t -- the standard Killing-vector
  // projections). u^t = 1/g(r) is also exactly the gravitational+orbital
  // redshift factor for a circular orbit (see diskRedshiftFactor). Returns
  // null where no timelike circular orbit exists at this radius.
  function circularOrbitFourVelocity(params, radius, sense = "prograde") {
    const omega = keplerianAngularVelocity(params, radius, sense);
    if (omega === null) return null;
    const g = metric(params, radius, Math.PI / 2);
    const normValue = g[0][0] + 2 * omega * g[0][3] + omega * omega * g[3][3];
    if (!(normValue < 0) || !Number.isFinite(normValue)) return null;
    const uT = 1 / Math.sqrt(-normValue);
    return {
      omega, uT,
      energy: -(g[0][0] + omega * g[0][3]) * uT,
      angularMomentum: (g[0][3] + omega * g[3][3]) * uT
    };
  }

  // Gravitational + orbital redshift factor g(r) = 1/u^t for a circular
  // equatorial orbit, i.e. the ratio (observed frequency)/(emitted frequency)
  // for a distant polar observer. This is the standard approximation used for
  // accretion-disk emission; it is exact only for that observer position (it
  // does not trace the emitted photon's actual path to an arbitrary camera,
  // which is the same class of problem as gravitational lensing). Returns
  // null where no timelike circular orbit exists at this radius.
  function diskRedshiftFactor(params, radius, sense = "prograde") {
    const state = circularOrbitFourVelocity(params, radius, sense);
    return state ? 1 / state.uT : null;
  }

  // Disk temperature profile: T(r) = T0 * (r_isco/r)^0.75 * sqrt(1 - sqrt(r_isco/r)),
  // the standard Shakura-Sunyaev/Novikov-Thorne zero-torque-at-the-inner-edge
  // shape (it correctly drives T to zero exactly at the ISCO rather than
  // needing an artificial cutoff). referenceKelvin (T0) is a display
  // constant, not derived from an accretion rate -- none is modeled here, so
  // only the RELATIVE falloff shape is physical, not the absolute scale.
  // Returns 0 at/inside the ISCO, or null where the ISCO itself is not known
  // for this spacetime (see iscoRadius).
  function diskTemperature(params, radius, sense = "prograde", referenceKelvin = 20000, iscoOverride = null) {
    const isco = iscoOverride !== null ? iscoOverride : iscoRadius(params, sense);
    if (isco === null) return null;
    if (!(radius > isco)) return 0;
    const x = isco / radius;
    return referenceKelvin * Math.pow(x, 0.75) * Math.sqrt(1 - Math.sqrt(x));
  }

  // Rough blackbody color approximation (Kelvin -> sRGB components in
  // [0,1]), self-contained so no external lookup texture/asset is needed.
  // This is a display convenience, not a radiative-transfer calculation: the
  // standard piecewise polynomial fit to blackbody chromaticity (public
  // domain, widely used in real-time graphics), valid over [1000K, 40000K]
  // and clamped to that range.
  function blackbodyColor(temperatureKelvin) {
    const t = Math.min(40000, Math.max(1000, temperatureKelvin)) / 100;
    let red;
    let green;
    if (t <= 66) {
      red = 255;
      green = 99.4708025861 * Math.log(t) - 161.1195681661;
    } else {
      red = 329.698727446 * Math.pow(t - 60, -0.1332047592);
      green = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    }
    let blue;
    if (t >= 66) blue = 255;
    else if (t <= 19) blue = 0;
    else blue = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    const clamp01 = (value) => Math.min(1, Math.max(0, value / 255));
    return { r: clamp01(red), g: clamp01(green), b: clamp01(blue) };
  }

  const AXIS_MARGIN = 1e-6;
  function checkCoordinateState(params, state, horizons = horizonData(params), limits = NUMERICS) {
    if (!state.every(Number.isFinite)) throw physicsError("nonFinite", "Non-finite coordinate state.");
    if (state[2] <= AXIS_MARGIN || state[2] >= Math.PI - AXIS_MARGIN) {
      throw physicsError("coordinateAxis", "The trajectory reached the polar coordinate boundary.");
    }
    if (horizons.hasHorizon && state[1] <= horizons.outer + limits.horizonMargin) {
      throw physicsError("outerHorizon", "The trajectory reached the outer-horizon coordinate margin.");
    }
    if (state[1] <= limits.singularityRadius) {
      throw physicsError("singularState", "The trajectory reached the inner coordinate boundary.");
    }
    // Only active when a caller opts in via limits.escapeRadius (e.g. lensing
    // ray tracing); NUMERICS has no such field, so every existing caller is
    // unaffected.
    if (Number.isFinite(limits.escapeRadius) && state[1] >= limits.escapeRadius) {
      throw physicsError("escapedToLarge", "The trajectory escaped beyond the configured tracing radius.");
    }
  }

  function zamoFrame(params, radius, theta) {
    checkCoordinateState(params, [0, radius, theta, 0]);
    const g = metric(params, radius, theta);
    const lapseSquared = -(g[0][0] - g[0][3] ** 2 / g[3][3]);
    if (![g[1][1], g[2][2], g[3][3], lapseSquared].every((v) => Number.isFinite(v) && v > 0)) {
      throw physicsError("invalidLocalFrame", "A timelike ZAMO frame is not available here.");
    }
    return { lapse: Math.sqrt(lapseSquared), omega: -g[0][3] / g[3][3],
      radialScale: Math.sqrt(g[1][1]), polarScale: Math.sqrt(g[2][2]), azimuthalScale: Math.sqrt(g[3][3]) };
  }

  function initialStateFromLocal(params, options) {
    const { radius, latitude, azimuth, elevation, speed, massive, photonEnergy = 1 } = options;
    if (![radius, latitude, azimuth, elevation, speed, photonEnergy].every(Number.isFinite)
      || Math.abs(latitude) >= 90 || Math.abs(azimuth) > 180 || Math.abs(elevation) > 90
      || typeof massive !== "boolean" || speed < 0 || (massive ? speed >= 1 : speed !== 1) || photonEnergy <= 0) {
      throw physicsError("invalidLocalConditions", "Invalid local launch conditions.");
    }
    const theta = Math.PI / 2 - latitude * Math.PI / 180;
    const frame = zamoFrame(params, radius, theta);
    const alpha = azimuth * Math.PI / 180;
    const beta = elevation * Math.PI / 180;
    const localEnergy = massive ? 1 / Math.sqrt((1 - speed) * (1 + speed)) : photonEnergy;
    const momentum = localEnergy * speed;
    // Positive elevation points north (-e_theta); azimuth zero points outward.
    const radial = momentum * Math.cos(beta) * Math.cos(alpha);
    const polar = -momentum * Math.sin(beta);
    const azimuthal = momentum * Math.cos(beta) * Math.sin(alpha);
    const time = localEnergy / frame.lapse;
    const state = [0, radius, theta, 0, time, radial / frame.radialScale,
      polar / frame.polarScale, azimuthal / frame.azimuthalScale + frame.omega * time];
    if (!state.every(Number.isFinite)) throw physicsError("invalidLocalConditions", "Invalid local launch conditions.");
    const norm = conservedQuantities(params, state).normalization;
    if (!Number.isFinite(norm) || Math.abs(norm - (massive ? -1 : 0)) > (massive ? 1e-6 : 1e-10 * localEnergy ** 2)) {
      throw physicsError("localPrecision", "The requested launch exceeds numerical normalization precision.");
    }
    return state;
  }

  function localConditionsFromState(params, state, massive) {
    const frame = zamoFrame(params, state[1], state[2]);
    const energy = frame.lapse * state[4];
    const radial = frame.radialScale * state[5];
    const polar = frame.polarScale * state[6];
    const azimuthal = frame.azimuthalScale * (state[7] - frame.omega * state[4]);
    const momentum = Math.hypot(radial, polar, azimuthal);
    if (!(energy > 0) || !Number.isFinite(energy) || !Number.isFinite(momentum)) {
      throw physicsError("invalidLocalFrame", "The state is not future-directed in the local frame.");
    }
    return { radius: state[1], latitude: 90 - state[2] * 180 / Math.PI,
      azimuth: momentum ? Math.atan2(azimuthal, radial) * 180 / Math.PI : 0,
      elevation: momentum ? Math.atan2(-polar, Math.hypot(radial, azimuthal)) * 180 / Math.PI : 0,
      speed: massive ? momentum / energy : 1, massive, photonEnergy: massive ? 1 : energy };
  }

  function initialStateFromConstants(params, options) {
    const theta = Math.PI / 2;
    const g = metric(params, options.radius, theta);
    const gInverse = inverseMetric(g);
    const kappa = options.massive ? -1 : 0;
    const velocity = [
      -gInverse[0][0] * options.energy + gInverse[0][3] * options.angularMomentum,
      0,
      0,
      -gInverse[0][3] * options.energy + gInverse[3][3] * options.angularMomentum
    ];
    const nonRadialNorm = metricContraction(g, velocity);
    let radialSquared = (kappa - nonRadialNorm) / g[1][1];
    if (radialSquared < 0 && radialSquared > -1e-10) radialSquared = 0;
    if (!Number.isFinite(radialSquared) || radialSquared < 0) {
      throw physicsError(
        "nonRealRadialVelocity",
        "The selected E and L_z do not produce a real radial velocity at r_0."
      );
    }
    const direction = options.radialDirection === "outgoing" ? 1 : -1;
    velocity[1] = direction * Math.sqrt(radialSquared);
    return [0, options.radius, theta, 0, ...velocity];
  }

  function geodesicRightHandSide(params, state) {
    const gamma = christoffelSymbols(params, state[1], state[2]);
    const derivative = Array(8).fill(0);
    for (let mu = 0; mu < 4; mu += 1) derivative[mu] = state[4 + mu];
    for (let mu = 0; mu < 4; mu += 1) {
      let acceleration = 0;
      for (let alpha = 0; alpha < 4; alpha += 1) {
        for (let beta = 0; beta < 4; beta += 1) {
          acceleration -= gamma[mu][alpha][beta] * state[4 + alpha] * state[4 + beta];
        }
      }
      derivative[4 + mu] = acceleration;
    }
    return derivative;
  }

  function addScaled(state, derivative, scale) {
    return state.map((value, index) => value + scale * derivative[index]);
  }

  function rk4Step(params, state, step, guard = null) {
    const derivative = (point) => {
      if (guard) guard(point);
      return geodesicRightHandSide(params, point);
    };
    const k1 = derivative(state);
    const k2 = derivative(addScaled(state, k1, step / 2));
    const k3 = derivative(addScaled(state, k2, step / 2));
    const k4 = derivative(addScaled(state, k3, step));
    return state.map((value, index) => value + step * (
      k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]
    ) / 6);
  }

  function integrateGeodesic(params, initialState, configuration = {}) {
    const settings = { ...NUMERICS, ...configuration };
    const horizons = horizonData(params);
    const guard = settings.guardCoordinates ? (point) => checkCoordinateState(params, point, horizons, settings) : null;
    if (guard) guard(initialState);
    const initialConstants = conservedQuantities(params, initialState);
    const points = [initialState.slice()];
    let state = initialState.slice();
    let lambda = 0;
    let stopReason = "maximumInterval";
    let maxNormalizationError = 0;
    let maxEnergyChange = 0;
    let maxAngularMomentumChange = 0;
    let maxThetaDrift = 0;
    let maxCarterChange = 0;

    const stepCount = Math.min(settings.maxSteps, Math.ceil(settings.maxLambda / settings.step));
    for (let index = 0; index < stepCount; index += 1) {
      if (horizons.hasHorizon && state[1] <= horizons.outer + settings.horizonMargin) {
        stopReason = "outerHorizon";
        break;
      }
      if (!horizons.hasHorizon && state[1] <= settings.singularityRadius) {
        stopReason = "singularState";
        break;
      }
      if (Number.isFinite(settings.escapeRadius) && state[1] >= settings.escapeRadius) {
        stopReason = "escapedToLarge";
        break;
      }

      try {
        const candidate = rk4Step(params, state, settings.step, guard);
        if (guard) guard(candidate);
        state = candidate;
      } catch (error) {
        stopReason = guard && ["coordinateAxis", "outerHorizon", "singularState", "nonFinite", "escapedToLarge"].includes(error.code)
          ? error.code : "invalidMetric";
        break;
      }
      lambda += settings.step;
      if (!state.every(Number.isFinite) || state[1] <= 0) {
        stopReason = "nonFinite";
        break;
      }

      const constants = conservedQuantities(params, state);
      maxNormalizationError = Math.max(
        maxNormalizationError,
        Math.abs(constants.normalization - initialConstants.normalization)
      );
      maxEnergyChange = Math.max(maxEnergyChange, Math.abs(constants.energy - initialConstants.energy));
      maxAngularMomentumChange = Math.max(
        maxAngularMomentumChange,
        Math.abs(constants.angularMomentum - initialConstants.angularMomentum)
      );
      maxThetaDrift = Math.max(maxThetaDrift, Math.abs(state[2] - Math.PI / 2));
      maxCarterChange = Math.max(maxCarterChange, Math.abs(constants.carter - initialConstants.carter));
      if (index % settings.sampleEvery === 0) points.push(state.slice());
    }

    const energyScale = Math.max(Math.abs(initialConstants.energy), 1e-14);
    const angularMomentumScale = Math.max(Math.abs(initialConstants.angularMomentum), 1e-14);
    return {
      points,
      finalState: state,
      lambda,
      stopReason,
      settings,
      initialConstants,
      checks: {
        normalizationError: maxNormalizationError,
        relativeEnergyChange: maxEnergyChange / energyScale,
        relativeAngularMomentumChange: maxAngularMomentumChange / angularMomentumScale,
        absoluteAngularMomentumChange: maxAngularMomentumChange,
        angularMomentumIsZero: Math.abs(initialConstants.angularMomentum) < 1e-14,
        thetaDrift: maxThetaDrift,
        absoluteCarterChange: maxCarterChange,
        scaledCarterChange: maxCarterChange / Math.max(1, Math.abs(initialConstants.carter))
      }
    };
  }

  // Precomputed deflection table for gravitational lensing of the starfield,
  // built from real backward-integrated photon geodesics (not a substitute
  // formula). For a spread of angles from the black hole's projected center,
  // a photon is launched from the camera's equatorial position AIMED AT the
  // black hole (azimuth 180 degrees, tilted by `angle`) and integrated
  // forward. Null geodesics are time-reversible, so this reproduces backward
  // ray tracing: a photon that reaches escapeRadius tells us the true sky
  // direction of the star actually visible at this angular offset from the
  // black hole; a photon absorbed by the horizon means that offset falls
  // inside the shadow. The trajectory is kept exactly equatorial (elevation
  // 0), which is an exact symmetry of this metric family, not an
  // approximation -- but the table itself is still 1-D (angle only, not
  // inclination relative to the spin axis), so Kerr-Newman's frame-dragging
  // lensing asymmetry is not captured for cameras away from the equator; a
  // documented limitation, not an oversight. It also cannot represent
  // multiple imaging (a star lensed into 2+ apparent positions), since each
  // angle maps to a single deflection value.
  //
  // The deflection is measured against the local launch direction at the
  // camera's own (finite) radius, in fixed plane coordinates anchored there
  // -- not against the idealized "source and observer both at infinity"
  // textbook formula. It therefore does not converge to 4M/b unless the
  // camera radius is large compared to the impact parameter b (checked in
  // runScientificValidation with a small angle at a large camera radius,
  // where that condition holds); at closer cameras it correctly reports a
  // smaller deflection, because part of the bending a distant-source photon
  // would have accumulated already happened before it reached the camera.
  function computeLensingTable(params, options = {}) {
    const {
      cameraRadius,
      samples = 28,
      maxAngle = 60,
      escapeRadius = 450,
      maxLambda = 1200,
      step = 0.3,
      maxSteps = 4000
    } = options;
    if (![cameraRadius, samples, maxAngle, escapeRadius, maxLambda, step, maxSteps].every(Number.isFinite)
      || cameraRadius <= 0 || samples < 2 || maxAngle <= 0 || maxAngle >= 90) {
      throw physicsError("invalidLensingRequest", "Invalid lensing table request.");
    }
    const settings = {
      step, maxLambda, maxSteps, sampleEvery: maxSteps, escapeRadius,
      guardCoordinates: true, horizonMargin: NUMERICS.horizonMargin, singularityRadius: NUMERICS.singularityRadius
    };
    const samplesOut = [];
    for (let i = 0; i < samples; i += 1) {
      // Geometric spacing concentrates samples near the shadow boundary,
      // where deflection is large and varies rapidly; the outer samples
      // (large angle, large impact parameter) need only a few points since
      // deflection there is small and smooth.
      const t = i / (samples - 1);
      const angle = maxAngle * t * t;
      let deflection = null;
      let stopReason;
      try {
        const initial = initialStateFromLocal(params, {
          radius: cameraRadius, latitude: 0, azimuth: 180 - angle,
          elevation: 0, speed: 1, massive: false, photonEnergy: 1
        });
        const result = integrateGeodesic(params, initial, settings);
        stopReason = result.stopReason;
        if (stopReason === "escapedToLarge") {
          const [, r, , phi, , radialVelocity, , azimuthalVelocity] = result.finalState;
          // Direction of motion in fixed (X = r cos phi, Y = r sin phi)
          // plane coordinates anchored at the launch point (phi = 0 there),
          // so this is a genuine fixed-axis comparison, not a frame that
          // rotates with r. The launch direction pointed toward -X (inward,
          // azimuth 180); flipping dX's sign expresses the escape direction
          // relative to that same inward axis, in the same sense as `angle`.
          const dX = radialVelocity * Math.cos(phi) - r * Math.sin(phi) * azimuthalVelocity;
          const dY = radialVelocity * Math.sin(phi) + r * Math.cos(phi) * azimuthalVelocity;
          const asymptoticAngle = Math.atan2(dY, -dX) * 180 / Math.PI;
          deflection = asymptoticAngle - angle;
        }
      } catch (error) {
        stopReason = error.code || "invalidMetric";
      }
      samplesOut.push({ angle, deflection, stopReason });
    }
    return { cameraRadius, settings, samples: samplesOut };
  }

  function nonzeroChristoffelAt(params, r, theta, tolerance = 1e-9) {
    const gamma = christoffelSymbols(params, r, theta);
    const coordinates = ["t", "r", "θ", "φ"];
    const entries = [];
    for (let mu = 0; mu < 4; mu += 1) {
      for (let alpha = 0; alpha < 4; alpha += 1) {
        for (let beta = alpha; beta < 4; beta += 1) {
          const value = gamma[mu][alpha][beta];
          if (Math.abs(value) > tolerance) {
            entries.push({
              label: `Γ^${coordinates[mu]}_{${coordinates[alpha]}${coordinates[beta]}}`,
              value
            });
          }
        }
      }
    }
    return entries;
  }

  function matrixProduct(left, right) {
    return left.map((row, i) => right[0].map((_, j) =>
      row.reduce((sum, value, k) => sum + value * right[k][j], 0)));
  }

  function maxIdentityResidual(matrix, matrixInverse = inverseMetric(matrix)) {
    const product = matrixProduct(matrix, matrixInverse);
    let residual = 0;
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        const identityEntry = row === column ? 1 : 0;
        residual = Math.max(residual, Math.abs(product[row][column] - identityEntry));
      }
    }
    return residual;
  }

  function maxChristoffelSymmetryResidual(gamma) {
    let residual = 0;
    for (let mu = 0; mu < 4; mu += 1) {
      for (let alpha = 0; alpha < 4; alpha += 1) {
        for (let beta = 0; beta < 4; beta += 1) {
          residual = Math.max(
            residual,
            Math.abs(gamma[mu][alpha][beta] - gamma[mu][beta][alpha])
          );
        }
      }
    }
    return residual;
  }

  function validationMeasurement(id, computed, tolerance, reference = 0) {
    const error = Math.abs(computed - reference);
    return {
      id,
      reference,
      computed,
      error,
      tolerance,
      passed: Number.isFinite(computed) && error <= tolerance
    };
  }

  // A check that throws (an invalid local frame, a singular metric, ...)
  // fails on its own instead of aborting the whole validation run.
  function isolated(run, failed) {
    try {
      return run();
    } catch (error) {
      return failed(error);
    }
  }

  // stopReason for a check that threw; tolerates a thrown non-Error value.
  const failureReason = (error) => error?.code || error?.name || String(error);

  function integrateValidationGeodesic(params, initialState, maxLambda, configuration = {}) {
    return integrateGeodesic(params, initialState, {
      step: VALIDATION_INTEGRATION.step,
      maxLambda,
      maxSteps: VALIDATION_INTEGRATION.maxSteps,
      sampleEvery: VALIDATION_INTEGRATION.sampleEvery,
      ...configuration
    });
  }

  // Completed means the whole interval was integrated, not one step short of
  // it; half a step absorbs the round-off accumulated by lambda += step.
  function completedInterval(result, maxLambda) {
    return result.stopReason === "maximumInterval"
      && result.lambda >= maxLambda - 0.5 * result.settings.step;
  }

  function invariantMeasurements(checks) {
    return [
      validationMeasurement("normalization", checks.normalizationError, VALIDATION_TOLERANCES.normalization),
      validationMeasurement("relativeEnergy", checks.relativeEnergyChange, VALIDATION_TOLERANCES.relativeConservation),
      validationMeasurement(
        "relativeAngularMomentum",
        checks.relativeAngularMomentumChange,
        VALIDATION_TOLERANCES.relativeConservation
      )
    ];
  }

  function geodesicBenchmarkResult(id, results, maxLambda, measurements) {
    const incomplete = results.find((result) => !completedInterval(result, maxLambda));
    const completed = !incomplete;
    return {
      id,
      maxLambda,
      step: results[results.length - 1].settings.step,
      completed,
      stopReason: (incomplete || results[results.length - 1]).stopReason,
      measurements,
      passed: completed && measurements.every((measurement) => measurement.passed)
    };
  }

  function runGeodesicBenchmark(configuration) {
    const params = { M: 1, a: 0, q: 0 };
    const initialState = initialStateFromConstants(params, {
      radius: configuration.radius,
      energy: configuration.energy,
      angularMomentum: configuration.angularMomentum,
      massive: configuration.massive,
      radialDirection: "outgoing"
    });
    const result = integrateValidationGeodesic(params, initialState, configuration.maxLambda);
    const states = [...result.points, result.finalState];
    const radialDrift = states.reduce((maximum, state) => Math.max(
      maximum,
      Math.abs(state[1] - configuration.radius) / configuration.radius
    ), 0);
    const measurements = [
      validationMeasurement(
        "relativeRadialDrift",
        radialDrift,
        VALIDATION_TOLERANCES.relativeRadialDrift
      ),
      ...invariantMeasurements(result.checks),
      validationMeasurement(
        "equatorialDrift",
        result.checks.thetaDrift,
        VALIDATION_TOLERANCES.equatorialDrift
      )
    ];
    return {
      ...geodesicBenchmarkResult(configuration.id, [result], configuration.maxLambda, measurements),
      radius: configuration.radius
    };
  }

  // Schwarzschild radial fall from rest at infinity (E = 1, L = 0): the affine
  // parameter is proper time and r(tau), t(tau) have closed forms, so unlike
  // the circular orbits this benchmark sees the RK4 truncation error.
  // Repeating it at 4h and 2h gives the observed order of convergence.
  function runRadialInfallBenchmark({ id, maxLambda }) {
    const params = { M: 1, a: 0, q: 0 };
    const startRadius = 10;
    const step = VALIDATION_INTEGRATION.infallStep;
    const radiusAt = (tau) => Math.pow(Math.pow(startRadius, 1.5) - 1.5 * Math.SQRT2 * tau, 2 / 3);
    // t = -4 [G(x)] from x0 to x, with x = sqrt(r / 2M).
    const primitive = (x) => x * x * x / 3 + x + 0.5 * Math.log((x - 1) / (x + 1));
    const timeAt = (tau) => -4 * (primitive(Math.sqrt(radiusAt(tau) / 2)) - primitive(Math.sqrt(startRadius / 2)));
    const initialState = initialStateFromConstants(params, {
      radius: startRadius, energy: 1, angularMomentum: 0, massive: true, radialDirection: "ingoing"
    });
    // Only the finest run stores every step, so its point i lies at tau = i * h.
    const sizes = [4 * step, 2 * step, step];
    const results = sizes.map((size, index) => integrateValidationGeodesic(params, initialState, maxLambda, {
      step: size,
      sampleEvery: index === sizes.length - 1 ? 1 : VALIDATION_INTEGRATION.maxSteps
    }));
    let radialError = 0;
    let timeError = 0;
    results[2].points.forEach((state, index) => {
      if (index === 0) return;
      const tau = index * step;
      radialError = Math.max(radialError, Math.abs(state[1] - radiusAt(tau)) / radiusAt(tau));
      timeError = Math.max(timeError, Math.abs(state[0] - timeAt(tau)) / timeAt(tau));
    });
    // Compare at tau = n * h rather than at the accumulated lambda, whose
    // summation round-off (~2e-13) is comparable to the error at h itself.
    const errors = results.map((result) => {
      const tau = Math.round(result.lambda / result.settings.step) * result.settings.step;
      return Math.abs(result.finalState[1] - radiusAt(tau));
    });
    const measurements = [
      validationMeasurement("analyticalRadius", radialError, VALIDATION_TOLERANCES.analyticalInfallRelative),
      validationMeasurement("analyticalCoordinateTime", timeError, VALIDATION_TOLERANCES.analyticalInfallRelative),
      validationMeasurement(
        "convergenceOrderCoarse",
        Math.log2(errors[0] / errors[1]),
        VALIDATION_TOLERANCES.convergenceOrder,
        4
      ),
      validationMeasurement(
        "convergenceOrderFine",
        Math.log2(errors[1] / errors[2]),
        VALIDATION_TOLERANCES.convergenceOrder,
        4
      )
    ];
    return geodesicBenchmarkResult(id, results, maxLambda, measurements);
  }

  // Non-equatorial orbit around a rotating, charged hole: there is no closed
  // form, but E, L_z, the Carter constant and the normalization are exact
  // invariants. A first-order integrator drifts far outside these tolerances.
  function runInvariantBenchmark(configuration) {
    const { id, params, initial, maxLambda } = configuration;
    // Only the invariant checks are read, and integrateGeodesic tracks those
    // at every step, so no trajectory points are stored.
    const result = integrateValidationGeodesic(
      params, initialStateFromLocal(params, initial), maxLambda,
      { guardCoordinates: true, sampleEvery: VALIDATION_INTEGRATION.maxSteps }
    );
    const measurements = [
      ...invariantMeasurements(result.checks),
      validationMeasurement(
        "carterConstant",
        result.checks.scaledCarterChange,
        VALIDATION_TOLERANCES.relativeConservation
      )
    ];
    return geodesicBenchmarkResult(id, [result], maxLambda, measurements);
  }

  // At the photon sphere the circular-orbit frequency from the geodesic
  // condition (keplerianAngularVelocity) must also make the orbit null.
  function photonSphereNullResidual(params, sense) {
    const radius = photonSphereRadius(params, sense);
    const omega = radius === null ? null : keplerianAngularVelocity(params, radius, sense);
    if (omega === null) return NaN;
    const g = metric(params, radius, Math.PI / 2);
    return g[0][0] + 2 * omega * g[0][3] + omega * omega * g[3][3];
  }

  // Weak-field check of the lensing deflection formula (re-implemented here,
  // not read from computeLensingTable): with the camera far from the hole
  // compared to the impact parameter (b/r small), the deflection should
  // approach the textbook 4M/b bending toward the hole, i.e. -4M/b here. See
  // computeLensingTable for why this only holds in that regime.
  function runLensingWeakFieldCheck(configuration) {
    const { id, params, cameraRadius, angle, escapeRadius, maxLambda, step, maxSteps, tolerance } = configuration;
    const settings = {
      step, maxLambda, maxSteps, sampleEvery: maxSteps, escapeRadius,
      guardCoordinates: true, horizonMargin: NUMERICS.horizonMargin, singularityRadius: NUMERICS.singularityRadius
    };
    const initial = initialStateFromLocal(params, {
      radius: cameraRadius, latitude: 0, azimuth: 180 - angle, elevation: 0,
      speed: 1, massive: false, photonEnergy: 1
    });
    const impactParameter = Math.abs(
      conservedQuantities(params, initial).angularMomentum / conservedQuantities(params, initial).energy
    );
    const result = integrateGeodesic(params, initial, settings);
    let deflection = null;
    if (result.stopReason === "escapedToLarge") {
      const [, r, , phi, , radialVelocity, , azimuthalVelocity] = result.finalState;
      const dX = radialVelocity * Math.cos(phi) - r * Math.sin(phi) * azimuthalVelocity;
      const dY = radialVelocity * Math.sin(phi) + r * Math.cos(phi) * azimuthalVelocity;
      const asymptoticAngle = Math.atan2(dY, -dX) * 180 / Math.PI;
      deflection = asymptoticAngle - angle;
    }
    // Bending toward the hole brings the asymptotic angle below the launch
    // angle, so in this convention the expected deflection is -4M/b.
    const weakFieldReference = -4 * params.M / impactParameter * 180 / Math.PI;
    const relativeError = deflection === null
      ? Infinity : Math.abs(deflection - weakFieldReference) / Math.abs(weakFieldReference);
    return {
      id,
      impactParameter,
      deflection,
      weakFieldReference,
      stopReason: result.stopReason,
      relativeError,
      tolerance,
      passed: deflection !== null && relativeError <= tolerance
    };
  }

  function runScientificValidation() {
    const schwarzschild = { M: 1, a: 0, q: 0 };
    const kerr = { M: 1, a: 0.7, q: 0 };
    const schwarzschildProperties = () => geometryProperties(schwarzschild, "schwarzschild");
    const reissnerNordstrom = { M: 1, a: 0, q: 0.6 };
    const kerrNewman = { M: 1, a: 0.6, q: 0.48 };
    const analyticalCases = [
      {
        id: "schwarzschildHorizon",
        reference: 2,
        computed: () => schwarzschildProperties().outer,
        unit: "M"
      },
      {
        id: "schwarzschildPhotonOrbit",
        reference: 3,
        computed: () => Number.parseFloat(schwarzschildProperties().orbitInfo.photon),
        unit: "M"
      },
      {
        id: "schwarzschildIsco",
        reference: 6,
        computed: () => Number.parseFloat(schwarzschildProperties().orbitInfo.isco),
        unit: "M"
      },
      {
        id: "kerrHorizon",
        reference: 1 + Math.sqrt(1 - 0.7 * 0.7),
        computed: () => horizonData(kerr).outer,
        unit: "M"
      },
      {
        // r± = M ± sqrt(M² - a² - q²); these parameters make both roots exact decimals.
        id: "reissnerNordstromOuterHorizon",
        reference: 1.8,
        computed: () => horizonData(reissnerNordstrom).outer,
        unit: "M"
      },
      {
        id: "reissnerNordstromInnerHorizon",
        reference: 0.2,
        computed: () => horizonData(reissnerNordstrom).inner,
        unit: "M"
      },
      {
        id: "kerrNewmanOuterHorizon",
        reference: 1.64,
        computed: () => horizonData(kerrNewman).outer,
        unit: "M"
      },
      {
        id: "kerrNewmanInnerHorizon",
        reference: 0.36,
        computed: () => horizonData(kerrNewman).inner,
        unit: "M"
      },
      {
        id: "reissnerNordstromPhotonSphere",
        reference: 0,
        computed: () => photonSphereNullResidual(reissnerNordstrom, "prograde"),
        unit: ""
      },
      {
        // q² = 5/8 puts the photon sphere exactly at r = 2.5M.
        id: "reissnerNordstromPhotonSphereRadius25",
        reference: 2.5,
        computed: () => photonSphereRadius({ M: 1, a: 0, q: Math.sqrt(5 / 8) }),
        unit: "M"
      },
      {
        id: "kerrPhotonSpherePrograde",
        reference: 0,
        computed: () => photonSphereNullResidual(kerr, "prograde"),
        unit: ""
      },
      {
        id: "kerrPhotonSphereRetrograde",
        reference: 0,
        computed: () => photonSphereNullResidual(kerr, "retrograde"),
        unit: ""
      },
      {
        id: "schwarzschildKeplerOmega",
        reference: Math.sqrt(1 / Math.pow(10, 3)),
        computed: () => keplerianAngularVelocity(schwarzschild, 10, "prograde"),
        unit: "M⁻¹"
      },
      {
        id: "kerrKeplerOmegaPrograde",
        reference: Math.sqrt(kerr.M) / (Math.pow(10, 1.5) + kerr.a * Math.sqrt(kerr.M)),
        computed: () => keplerianAngularVelocity(kerr, 10, "prograde"),
        unit: "M⁻¹"
      },
      {
        id: "kerrKeplerOmegaRetrograde",
        reference: -Math.sqrt(kerr.M) / (Math.pow(10, 1.5) - kerr.a * Math.sqrt(kerr.M)),
        computed: () => keplerianAngularVelocity(kerr, 10, "retrograde"),
        unit: "M⁻¹"
      },
      {
        // Standard closed form for the redshift of matter on a circular
        // Schwarzschild orbit at the ISCO: g = sqrt(1 - 3M/r).
        id: "schwarzschildIscoRedshift",
        reference: Math.sqrt(1 - 3 / 6),
        computed: () => diskRedshiftFactor(schwarzschild, 6, "prograde"),
        unit: ""
      },
      {
        // The ergosphere is tangent to the outer horizon at the poles.
        id: "kerrErgosphereTangentAtPole",
        reference: horizonData(kerr).outer,
        computed: () => outerStaticLimitAtTheta(kerr, 0),
        unit: "M"
      },
      {
        // Standard closed-form Schwarzschild ISCO orbital constants.
        id: "schwarzschildIscoEnergy",
        reference: 2 * Math.sqrt(2) / 3,
        computed: () => circularOrbitFourVelocity(schwarzschild, 6, "prograde").energy,
        unit: ""
      },
      {
        id: "schwarzschildIscoAngularMomentum",
        reference: 2 * Math.sqrt(3),
        computed: () => circularOrbitFourVelocity(schwarzschild, 6, "prograde").angularMomentum,
        unit: "M"
      }
    ].map((entry) => ({
      ...validationMeasurement(
        entry.id,
        isolated(entry.computed, () => NaN),
        VALIDATION_TOLERANCES.analyticalAbsolute,
        entry.reference
      ),
      unit: entry.unit
    }));

    const familyCases = [
      { id: "schwarzschildFamily", q: 0, a: 0, reference: "schwarzschild" },
      { id: "reissnerNordstromFamily", q: 0.2, a: 0, reference: "reissnerNordstrom" },
      { id: "kerrFamily", q: 0, a: 0.7, reference: "kerr" },
      { id: "kerrNewmanFamily", q: 0.2, a: 0.7, reference: "kerrNewman" }
    ].map((entry) => {
      const computed = classifySpacetime(entry.q !== 0, entry.a !== 0);
      return { ...entry, computed, passed: computed === entry.reference };
    });

    const tensorPoint = { params: { M: 1, a: 0.7, q: 0.2 }, r: 10, theta: Math.PI / 3 };
    const tensorCases = [
      validationMeasurement(
        "metricInverse",
        isolated(() => {
          const tensorMetric = metric(tensorPoint.params, tensorPoint.r, tensorPoint.theta);
          return maxIdentityResidual(tensorMetric, inverseMetric(tensorMetric));
        }, () => NaN),
        VALIDATION_TOLERANCES.tensorResidual
      ),
      validationMeasurement(
        "christoffelSymmetry",
        isolated(
          () => maxChristoffelSymmetryResidual(christoffelSymbols(tensorPoint.params, tensorPoint.r, tensorPoint.theta)),
          () => NaN
        ),
        VALIDATION_TOLERANCES.christoffelSymmetry
      )
    ];

    // A benchmark that throws keeps the shape of a result, so the page shows
    // it as one failed row next to the others.
    const failedBenchmark = (configuration, error) => ({
      id: configuration.id,
      maxLambda: configuration.maxLambda,
      completed: false,
      stopReason: failureReason(error),
      measurements: [{ id: "computationError", reference: NaN, computed: NaN, error: NaN, tolerance: NaN, passed: false }],
      passed: false
    });
    const geodesicCases = [
      [runGeodesicBenchmark, {
        id: "photonCircular",
        radius: 3,
        energy: 1,
        angularMomentum: 3 * Math.sqrt(3),
        massive: false,
        maxLambda: VALIDATION_INTEGRATION.photonMaxLambda
      }],
      [runGeodesicBenchmark, {
        id: "massiveCircular",
        radius: 8,
        energy: (1 - 2 / 8) / Math.sqrt(1 - 3 / 8),
        angularMomentum: Math.sqrt(8) / Math.sqrt(1 - 3 / 8),
        massive: true,
        maxLambda: VALIDATION_INTEGRATION.massiveMaxLambda
      }],
      [runRadialInfallBenchmark, { id: "radialInfall", maxLambda: VALIDATION_INTEGRATION.infallMaxLambda }],
      [runInvariantBenchmark, {
        id: "kerrNewmanInclined",
        params: { M: 1, a: 0.7, q: 0.2 },
        initial: { radius: 12, latitude: 23, azimuth: 110, elevation: 20, speed: 0.4, massive: true, photonEnergy: 1 },
        maxLambda: VALIDATION_INTEGRATION.massiveMaxLambda
      }]
    ].map(([run, configuration]) => isolated(
      () => run(configuration),
      (error) => failedBenchmark(configuration, error)
    ));

    const lensingCases = [
      {
        id: "schwarzschildWeakFieldDeflection",
        params: schwarzschild,
        cameraRadius: 2000,
        angle: 8,
        escapeRadius: 40000,
        maxLambda: 80000,
        // h = 8 keeps the integration error (~2e-7 degrees) negligible next to
        // the ~0.6 % gap from the leading-order 4M/b formula measured here.
        step: 8,
        maxSteps: 40000,
        tolerance: VALIDATION_TOLERANCES.lensingWeakFieldRelative
      }
    ].map((configuration) => isolated(() => runLensingWeakFieldCheck(configuration), (error) => ({
      id: configuration.id,
      deflection: null,
      weakFieldReference: NaN,
      stopReason: failureReason(error),
      relativeError: Infinity,
      tolerance: configuration.tolerance,
      passed: false
    })));

    const passed = analyticalCases.every((entry) => entry.passed)
      && familyCases.every((entry) => entry.passed)
      && tensorCases.every((entry) => entry.passed)
      && geodesicCases.every((entry) => entry.passed)
      && lensingCases.every((entry) => entry.passed);
    return {
      passed,
      tolerances: VALIDATION_TOLERANCES,
      integration: VALIDATION_INTEGRATION,
      analyticalCases,
      familyCases,
      tensorPoint,
      tensorCases,
      geodesicCases,
      lensingCases
    };
  }

  window.KerrNewmanPhysics = Object.freeze({
    SI,
    NUMERICS,
    VALIDATION_TOLERANCES,
    VALIDATION_INTEGRATION,
    physicalToGeometrized,
    geometrizedToPhysical,
    angularMomentumForSpin,
    dimensionlessParameters,
    classifySpacetime,
    detectSpacetime,
    horizonData,
    geometryProperties,
    outerStaticLimitAtTheta,
    iscoRadius,
    photonSphereRadius,
    circularOrbitInformation,
    keplerianAngularVelocity,
    circularOrbitFourVelocity,
    diskRedshiftFactor,
    diskTemperature,
    blackbodyColor,
    metric,
    metricDerivatives,
    inverseMetric,
    christoffelSymbols,
    conservedQuantities,
    initialStateFromConstants,
    initialStateFromLocal,
    localConditionsFromState,
    zamoFrame,
    geodesicRightHandSide,
    rk4Step,
    integrateGeodesic,
    computeLensingTable,
    nonzeroChristoffelAt,
    matrixProduct,
    maxIdentityResidual,
    maxChristoffelSymmetryResidual,
    runGeodesicBenchmark,
    runScientificValidation,
    cloneMatrix
  });
}());
