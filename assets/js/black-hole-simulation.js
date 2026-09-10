/* Shared configuration and execution for the 2D and 3D views. */
(function () {
  "use strict";
  const P = window.KerrNewmanPhysics;
  const DEFAULT_MASS_SOLAR = 10;
  const DEFAULT_SPIN = 0.7;
  // The next three helpers derive preset (radius, energy, lz) triples from
  // the physics engine's own closed-form functions at module-load time,
  // the same way massiveCircular's own energy/lz already do inline for
  // Schwarzschild -- no separately-derived or hand-copied numbers, so if
  // the underlying formulas are ever revisited these presets stay correct
  // automatically.
  //
  // Reverse the mass/charge/spin conversion pipeline to find the physical
  // Coulomb charge that gives a target dimensionless q* at a given mass
  // (q* is linear in chargeC, so a single probe at chargeC=1 suffices).
  function chargeCForQStar(massSolar, qStarTarget) {
    const probe = P.dimensionlessParameters({ massSolar, chargeC: 1, angularMomentum: 0 });
    return qStarTarget / probe.q;
  }
  // A massive test particle held exactly on the (prograde/retrograde) ISCO
  // circular orbit, via the same P.circularOrbitFourVelocity used for the
  // disk/plunging-region physics.
  function kerrIscoPreset(aStar, sense, maxLambda) {
    const params = { M: 1, a: aStar, q: 0 };
    const radius = P.iscoRadius(params, sense);
    const orbit = P.circularOrbitFourVelocity(params, radius, sense);
    return { object: "massive", aStar, qC: 0, radius, energy: orbit.energy, lz: orbit.angularMomentum, direction: "outgoing", maxLambda };
  }
  // A photon held exactly on the (prograde/retrograde) circular photon-
  // sphere orbit. There is no timelike (-1) normalization for a null
  // geodesic, so unlike kerrIscoPreset this projects the metric's Killing
  // vectors directly at the circular-orbit angular velocity P.keplerian
  // AngularVelocity already gives (verified numerically to satisfy the
  // null condition g_tt + 2*Omega*g_tphi + Omega^2*g_phiphi = 0 to machine
  // precision at r = photonSphereRadius), then rescales to energy = 1 to
  // match every other photon preset's convention.
  function kerrPhotonSpherePreset(aStar, sense, maxLambda) {
    const params = { M: 1, a: aStar, q: 0 };
    const radius = P.photonSphereRadius(params, sense, "kerr");
    const omega = P.keplerianAngularVelocity(params, radius, sense);
    const g = P.metric(params, radius, Math.PI / 2);
    const energyRaw = -(g[0][0] + omega * g[0][3]);
    const lzRaw = g[0][3] + omega * g[3][3];
    return { object: "photon", aStar, qC: 0, radius, energy: 1, lz: lzRaw / energyRaw, direction: "outgoing", maxLambda };
  }
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
    },
    // Reissner-Nordstrom (charged, non-spinning): q* = 0.9 gives a clearly
    // split double horizon (outer ~1.44M, inner ~0.56M) -- the project's
    // own namesake (Kerr-*Newman*) had no preset showing charge at all
    // before this one. Mirrors massiveInfall's near-radial infall so the
    // only thing that changes is the charge.
    massiveChargedInfall: {
      object: "massive", aStar: 0, qC: chargeCForQStar(DEFAULT_MASS_SOLAR, 0.9), radius: 12, energy: 1,
      lz: 0, direction: "ingoing", maxLambda: 60
    },
    // Prograde/retrograde ISCO pair (Kerr a* = 0.7, matching the spin
    // already used by photonCapture/massiveInfall): the retrograde ISCO
    // sits at roughly 2.4x the prograde one for the same spin, an effect
    // no prior preset illustrated despite the engine having supported it
    // since the plunging-region work.
    massiveIscoPrograde: kerrIscoPreset(0.7, "prograde", 60),
    massiveIscoRetrograde: kerrIscoPreset(0.7, "retrograde", 60),
    // Prograde/retrograde circular-photon-orbit pair -- the Kerr
    // counterpart of photonCircular, which only covers Schwarzschild.
    photonSpherePrograde: kerrPhotonSpherePreset(0.7, "prograde", 40),
    photonSphereRetrograde: kerrPhotonSpherePreset(0.7, "retrograde", 40)
  };

  const PRESETS_3D = {
    photonInclined: { aStar: 0.5, radius: 4, latitude: 20, azimuth: 100, elevation: 30, speed: 1, massive: false, maxLambda: 20 },
    massiveInclined: { aStar: 0.7, radius: 12, latitude: 23, azimuth: 110, elevation: 20, speed: 0.4, massive: true, maxLambda: 60 },
    // Same launch as massiveInclined but a* = 0: with no frame-dragging the
    // orbital plane does not precess, giving a direct with/without-spin
    // comparison. Replaces massiveSouthern, which (latitude/elevation sign
    // flipped, spin unchanged) was an exact mirror image of massiveInclined
    // under Kerr's cos^2(theta) symmetry -- no new physics, just the same
    // orbit seen from the other hemisphere.
    massiveInclinedSchwarzschild: { aStar: 0, radius: 12, latitude: 23, azimuth: 110, elevation: 20, speed: 0.4, massive: true, maxLambda: 60 }
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
