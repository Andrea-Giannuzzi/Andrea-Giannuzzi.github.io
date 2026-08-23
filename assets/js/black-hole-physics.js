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
    equatorialDrift: 1e-10
  });

  const VALIDATION_INTEGRATION = Object.freeze({
    step: 0.01,
    photonMaxLambda: 10,
    massiveMaxLambda: 20,
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

  function circularOrbitInformation(params, type = detectSpacetime(params)) {
    if (type === "schwarzschild") {
      return { isco: "6 M", photon: "3 M" };
    }
    if (type === "reissnerNordstrom") {
      const discriminant = 9 - 8 * params.q * params.q;
      const photon = discriminant >= 0
        ? `${((3 + Math.sqrt(discriminant)) / 2).toFixed(6)} M`
        : "N/A";
      return { isco: "N/A", photon };
    }
    if (type === "kerr") {
      const spin = Math.min(Math.abs(params.a), 1);
      const z1 = 1 + Math.cbrt(1 - spin * spin)
        * (Math.cbrt(1 + spin) + Math.cbrt(1 - spin));
      const z2 = Math.sqrt(3 * spin * spin + z1 * z1);
      const radical = Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
      const progradeIsco = 3 + z2 - radical;
      const retrogradeIsco = 3 + z2 + radical;
      const progradePhoton = 2 * (1 + Math.cos((2 / 3) * Math.acos(-spin)));
      const retrogradePhoton = 2 * (1 + Math.cos((2 / 3) * Math.acos(spin)));
      return {
        isco: `prograde ${progradeIsco.toFixed(6)} M; retrograde ${retrogradeIsco.toFixed(6)} M`,
        photon: `prograde ${progradePhoton.toFixed(6)} M; retrograde ${retrogradePhoton.toFixed(6)} M`
      };
    }
    return { isco: "N/A", photon: "N/A" };
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
    return {
      energy: -(g[0][0] * velocity[0] + g[0][3] * velocity[3]),
      angularMomentum: g[3][0] * velocity[0] + g[3][3] * velocity[3],
      normalization: metricContraction(g, velocity)
    };
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

  function rk4Step(params, state, step) {
    const k1 = geodesicRightHandSide(params, state);
    const k2 = geodesicRightHandSide(params, addScaled(state, k1, step / 2));
    const k3 = geodesicRightHandSide(params, addScaled(state, k2, step / 2));
    const k4 = geodesicRightHandSide(params, addScaled(state, k3, step));
    return state.map((value, index) => value + step * (
      k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]
    ) / 6);
  }

  function integrateGeodesic(params, initialState, configuration = {}) {
    const settings = { ...NUMERICS, ...configuration };
    const horizons = horizonData(params);
    const initialConstants = conservedQuantities(params, initialState);
    const points = [initialState.slice()];
    let state = initialState.slice();
    let lambda = 0;
    let stopReason = "maximumInterval";
    let maxNormalizationError = 0;
    let maxEnergyChange = 0;
    let maxAngularMomentumChange = 0;
    let maxThetaDrift = 0;

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

      try {
        state = rk4Step(params, state, settings.step);
      } catch (error) {
        stopReason = "invalidMetric";
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
        thetaDrift: maxThetaDrift
      }
    };
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

  function validationMeasurement(id, computed, tolerance) {
    return {
      id,
      computed,
      error: Math.abs(computed),
      tolerance,
      passed: Number.isFinite(computed) && Math.abs(computed) <= tolerance
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
    const result = integrateGeodesic(params, initialState, {
      step: VALIDATION_INTEGRATION.step,
      maxLambda: configuration.maxLambda,
      maxSteps: VALIDATION_INTEGRATION.maxSteps,
      sampleEvery: VALIDATION_INTEGRATION.sampleEvery
    });
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
      validationMeasurement(
        "normalization",
        result.checks.normalizationError,
        VALIDATION_TOLERANCES.normalization
      ),
      validationMeasurement(
        "relativeEnergy",
        result.checks.relativeEnergyChange,
        VALIDATION_TOLERANCES.relativeConservation
      ),
      validationMeasurement(
        "relativeAngularMomentum",
        result.checks.relativeAngularMomentumChange,
        VALIDATION_TOLERANCES.relativeConservation
      ),
      validationMeasurement(
        "equatorialDrift",
        result.checks.thetaDrift,
        VALIDATION_TOLERANCES.equatorialDrift
      )
    ];
    const completed = result.stopReason === "maximumInterval"
      && result.lambda >= configuration.maxLambda - VALIDATION_INTEGRATION.step;
    return {
      id: configuration.id,
      radius: configuration.radius,
      maxLambda: configuration.maxLambda,
      step: VALIDATION_INTEGRATION.step,
      completed,
      stopReason: result.stopReason,
      measurements,
      passed: completed && measurements.every((measurement) => measurement.passed)
    };
  }

  function runScientificValidation() {
    const schwarzschild = { M: 1, a: 0, q: 0 };
    const kerr = { M: 1, a: 0.7, q: 0 };
    const schwarzschildProperties = geometryProperties(schwarzschild, "schwarzschild");
    const analyticalCases = [
      {
        id: "schwarzschildHorizon",
        reference: 2,
        computed: schwarzschildProperties.outer
      },
      {
        id: "schwarzschildPhotonOrbit",
        reference: 3,
        computed: Number.parseFloat(schwarzschildProperties.orbitInfo.photon)
      },
      {
        id: "schwarzschildIsco",
        reference: 6,
        computed: Number.parseFloat(schwarzschildProperties.orbitInfo.isco)
      },
      {
        id: "kerrHorizon",
        reference: 1 + Math.sqrt(1 - 0.7 * 0.7),
        computed: horizonData(kerr).outer
      }
    ].map((entry) => {
      const error = Math.abs(entry.computed - entry.reference);
      return {
        ...entry,
        error,
        tolerance: VALIDATION_TOLERANCES.analyticalAbsolute,
        passed: Number.isFinite(entry.computed)
          && error <= VALIDATION_TOLERANCES.analyticalAbsolute
      };
    });

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
    const tensorMetric = metric(tensorPoint.params, tensorPoint.r, tensorPoint.theta);
    const tensorInverse = inverseMetric(tensorMetric);
    const tensorGamma = christoffelSymbols(
      tensorPoint.params,
      tensorPoint.r,
      tensorPoint.theta
    );
    const tensorCases = [
      validationMeasurement(
        "metricInverse",
        maxIdentityResidual(tensorMetric, tensorInverse),
        VALIDATION_TOLERANCES.tensorResidual
      ),
      validationMeasurement(
        "christoffelSymmetry",
        maxChristoffelSymmetryResidual(tensorGamma),
        VALIDATION_TOLERANCES.christoffelSymmetry
      )
    ];

    const geodesicCases = [
      runGeodesicBenchmark({
        id: "photonCircular",
        radius: 3,
        energy: 1,
        angularMomentum: 3 * Math.sqrt(3),
        massive: false,
        maxLambda: VALIDATION_INTEGRATION.photonMaxLambda
      }),
      runGeodesicBenchmark({
        id: "massiveCircular",
        radius: 8,
        energy: (1 - 2 / 8) / Math.sqrt(1 - 3 / 8),
        angularMomentum: Math.sqrt(8) / Math.sqrt(1 - 3 / 8),
        massive: true,
        maxLambda: VALIDATION_INTEGRATION.massiveMaxLambda
      })
    ];

    const passed = analyticalCases.every((entry) => entry.passed)
      && familyCases.every((entry) => entry.passed)
      && tensorCases.every((entry) => entry.passed)
      && geodesicCases.every((entry) => entry.passed);
    return {
      passed,
      tolerances: VALIDATION_TOLERANCES,
      integration: VALIDATION_INTEGRATION,
      analyticalCases,
      familyCases,
      tensorPoint,
      tensorCases,
      geodesicCases
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
    metric,
    metricDerivatives,
    inverseMetric,
    christoffelSymbols,
    conservedQuantities,
    initialStateFromConstants,
    geodesicRightHandSide,
    rk4Step,
    integrateGeodesic,
    nonzeroChristoffelAt,
    matrixProduct,
    maxIdentityResidual,
    maxChristoffelSymmetryResidual,
    runGeodesicBenchmark,
    runScientificValidation,
    cloneMatrix
  });
}());
