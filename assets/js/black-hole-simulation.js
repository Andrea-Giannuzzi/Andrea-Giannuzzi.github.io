/* Shared configuration and execution for the 2D and 3D views. */
(function () {
  "use strict";
  const P = window.KerrNewmanPhysics;
  const DEFAULT_MASS_SOLAR = 10;
  const DEFAULT_SPIN = 0.7;
  const PRESETS = {
    photonCircular: {
      object: "photon", aStar: 0, qC: 0, radius: 3, energy: 1,
      lz: 3 * Math.sqrt(3), direction: "outgoing", maxLambda: 40
    },
    photonCapture: {
      object: "photon", aStar: 0.7, qC: 0, radius: 12, energy: 1,
      lz: 2.5, direction: "ingoing", maxLambda: 55
    },
    photonScattering: {
      object: "photon", aStar: 0, qC: 0, radius: 18, energy: 1,
      lz: 6, direction: "ingoing", maxLambda: 80
    },
    massiveCircular: {
      object: "massive", aStar: 0, qC: 0, radius: 8,
      energy: (1 - 2 / 8) / Math.sqrt(1 - 3 / 8),
      lz: Math.sqrt(8) / Math.sqrt(1 - 3 / 8), direction: "outgoing", maxLambda: 60
    },
    massiveInfall: {
      object: "massive", aStar: 0.7, qC: 0, radius: 12, energy: 1,
      lz: 0, direction: "ingoing", maxLambda: 60
    },
    massiveFlyby: {
      object: "massive", aStar: 0, qC: 0, radius: 18, energy: 1.02,
      lz: 5, direction: "ingoing", maxLambda: 100
    }
  };

  const PRESETS_3D = {
    photonInclined: { aStar: 0.5, radius: 4, latitude: 20, azimuth: 100, elevation: 30, speed: 1, massive: false, maxLambda: 20 },
    massiveInclined: { aStar: 0.7, radius: 12, latitude: 23, azimuth: 110, elevation: 20, speed: 0.4, massive: true, maxLambda: 60 },
    massiveSouthern: { aStar: 0.7, radius: 12, latitude: -23, azimuth: 110, elevation: -20, speed: 0.4, massive: true, maxLambda: 60 }
  };
  const TRANSFER_KEY = "black-hole-2d-to-3d-v1";
  const SESSION_KEY = "black-hole-last-2d-v1";
  function invalid() {
    const error = new Error("Invalid simulation configuration.");
    error.code = "invalidConfiguration";
    throw error;
  }
  function validate(config) {
    if (!config || ![1, 2].includes(config.version) || !config.physical || !config.initial) invalid();
    const { physical, initial } = config;
    if (![physical.massSolar, physical.chargeC, physical.angularMomentum, initial.radius, config.maxLambda].every(Number.isFinite)) invalid();
    if (physical.massSolar <= 0 || initial.radius < 0.05 || typeof initial.massive !== "boolean"
      || !["physical", "geometrized"].includes(config.unitMode)
      || !(config.preset === null || Object.hasOwn(PRESETS, config.preset) || (config.version === 2 && Object.hasOwn(PRESETS_3D, config.preset)))
      || config.maxLambda <= 0 || config.maxLambda > P.NUMERICS.maxSteps * P.NUMERICS.step) invalid();
    const params = P.dimensionlessParameters(physical);
    if (![params.a, params.q, params.geometry.chargeMeters, params.geometry.angularMomentumMeters2].every(Number.isFinite)) invalid();
    let conditions;
    if (config.version === 1) {
      if (![initial.energy, initial.angularMomentum].every(Number.isFinite) || initial.energy <= 0
        || !["ingoing", "outgoing"].includes(initial.radialDirection)) invalid();
      conditions = { radius: initial.radius, energy: initial.energy, angularMomentum: initial.angularMomentum,
        massive: initial.massive, radialDirection: initial.radialDirection };
    } else {
      if (![initial.latitude, initial.azimuth, initial.elevation, initial.speed, initial.photonEnergy].every(Number.isFinite)
        || Math.abs(initial.latitude) >= 90 || Math.abs(initial.azimuth) > 180 || Math.abs(initial.elevation) > 90
        || initial.speed < 0 || (initial.massive ? initial.speed >= 1 : initial.speed !== 1)
        || initial.photonEnergy <= 0) invalid();
      conditions = { radius: initial.radius, latitude: initial.latitude, azimuth: initial.azimuth,
        elevation: initial.elevation, speed: initial.speed, massive: initial.massive, photonEnergy: initial.photonEnergy };
    }
    // Version 1 remains the persisted 2D format; version 2 represents local 3D launches.
    return { version: config.version, unitMode: config.unitMode, preset: config.preset,
      physical: { massSolar: physical.massSolar, chargeC: physical.chargeC, angularMomentum: physical.angularMomentum },
      initial: conditions, maxLambda: config.maxLambda };
  }
  function presetConfiguration(name = "photonCapture", unitMode = "physical") {
    if (Object.hasOwn(PRESETS_3D, name)) {
      const preset = PRESETS_3D[name];
      return validate({ version: 2, unitMode, preset: name,
        physical: { massSolar: DEFAULT_MASS_SOLAR, chargeC: 0,
          angularMomentum: P.angularMomentumForSpin(DEFAULT_MASS_SOLAR, preset.aStar) },
        initial: { radius: preset.radius, latitude: preset.latitude, azimuth: preset.azimuth,
          elevation: preset.elevation, speed: preset.speed, massive: preset.massive, photonEnergy: 1 },
        maxLambda: preset.maxLambda });
    }
    if (!Object.hasOwn(PRESETS, name)) invalid();
    const preset = PRESETS[name];
    return validate({
      version: 1, unitMode, preset: name,
      physical: { massSolar: DEFAULT_MASS_SOLAR, chargeC: preset.qC,
        angularMomentum: P.angularMomentumForSpin(DEFAULT_MASS_SOLAR, preset.aStar) },
      initial: { radius: preset.radius, energy: preset.energy, angularMomentum: preset.lz,
        massive: preset.object === "massive", radialDirection: preset.direction },
      maxLambda: preset.maxLambda
    });
  }
  function prepare(input) {
    const config = validate(input);
    const { physical } = config;
    const params = P.dimensionlessParameters(physical);
    const spacetime = P.classifySpacetime(physical.chargeC !== 0, physical.angularMomentum !== 0);
    const properties = P.geometryProperties(params, spacetime);
    if (properties.hasHorizon && config.initial.radius <= properties.outer + P.NUMERICS.horizonMargin) {
      const error = new Error("r_0 must lie outside the outer horizon in Boyer-Lindquist coordinates.");
      error.code = "insideOuterHorizon";
      throw error;
    }
    const initialState = config.version === 1
      ? P.initialStateFromConstants(params, config.initial) : P.initialStateFromLocal(params, config.initial);
    return { config, params, physical, properties, initialState };
  }
  function toLocalConfiguration(input) {
    const config = validate(input);
    if (config.version === 2) return config;
    const { params, initialState } = prepare(config);
    return validate({ ...config, version: 2,
      initial: P.localConditionsFromState(params, initialState, config.initial.massive) });
  }
  function run(input) {
    const simulation = prepare(input);
    const settings = { maxLambda: simulation.config.maxLambda };
    if (simulation.config.version === 2) settings.guardCoordinates = true;
    const result = P.integrateGeodesic(simulation.params, simulation.initialState, settings);
    return { ...simulation, result };
  }
  function save(config) {
    try {
      const record = validate(config);
      if (record.version !== 1) return false;
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(record)); return true;
    }
    catch (_) { return false; }
  }
  function load() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      const config = raw ? validate(JSON.parse(raw)) : null;
      if (config && config.version !== 1) invalid();
      return { config, error: false };
    } catch (_) { return { config: null, error: true }; }
  }
  function transferTo3D(input, autoRun) {
    const config = validate(input);
    if (config.version !== 1 || typeof autoRun !== "boolean") invalid();
    // Reject impossible local conversions before leaving the 2D form.
    toLocalConfiguration(config);
    try {
      window.sessionStorage.setItem(TRANSFER_KEY, JSON.stringify({ config, autoRun }));
      return true;
    } catch (_) { return false; }
  }
  function load3DTransfer() {
    try {
      const raw = window.sessionStorage.getItem(TRANSFER_KEY);
      if (!raw) return { config: null, autoRun: false, error: false };
      const record = JSON.parse(raw);
      const config = validate(record.config);
      if (config.version !== 1 || typeof record.autoRun !== "boolean") invalid();
      return { config, autoRun: record.autoRun, error: false };
    } catch (_) { return { config: null, autoRun: false, error: true }; }
  }
  window.BlackHoleSimulation = Object.freeze({ PRESETS, PRESETS_3D, DEFAULT_MASS_SOLAR, DEFAULT_SPIN,
    validate, presetConfiguration, prepare, toLocalConfiguration, run, save, load, transferTo3D, load3DTransfer });
}());
