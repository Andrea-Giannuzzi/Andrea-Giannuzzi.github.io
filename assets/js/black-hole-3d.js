/* Three.js r128 visual foundation from 3D-Simulator_Good_Graphic.html.
 * The disk and stars are illustrations; geodesics come from the shared solver.
 */
(function () {
  "use strict";
  const P = window.KerrNewmanPhysics;
  const S = window.BlackHoleSimulation;
  const $ = (selector) => document.querySelector(selector);
  const form = $("[data-3d-form]");
  const field = (name) => form.elements.namedItem(name);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let language = "en";
  try { language = localStorage.getItem("portfolio-language") === "it" ? "it" : "en"; } catch (_) { /* Language still works without storage. */ }
  let unitMode = "physical";
  let preset = "photonCapture";
  let simulation = null;
  let originalConfiguration = null;
  let photonEnergy = 1;
  let previousMassiveSpeed = 0.5;
  let paused = true;
  let affineTime = 0;
  let endTime = 0;
  let points = [];
  let times = [];
  let positions = [];
  // Parallel to points/times/positions (same length, same indices): the
  // local redshift g = 1/u^t (state[4]) and the Boyer-Lindquist coordinate
  // time t (state[0]) at each sample, used to fade the trajectory/particle
  // and to show t next to lambda as a trajectory nears a horizon-margin
  // stop -- see updatePlayback().
  let redshifts = [];
  let tValues = [];
  let sampleIndex = 0;
  let frame = null;
  let previousTime = null;
  let computing = false;
  let scene, camera, renderer, controls, blackHole, disk, stars, particle, trajectory, ergosphere, ergosphereWire, plungingRegion;
  // Per-stream (lambda, position, color) sample tables for the plunging
  // region, kept so updatePlungingRegion() can animate them -- see
  // buildPlungingRegion().
  let plungingStreams = [];
  let viewRadius = 24;
  let layoutScale = 1;
  let diskClock = 0;
  let diskVisible = true;
  let ergosphereVisible = true;
  let starOriginalPositions = null;
  let lensingTable = null;
  let messageKey = "ready";
  let formMessageKey = "";
  let lastError = null;
  const copy = () => window.PORTFOLIO_CONTENT[language].blackHoleSimulator;
  const text = (key) => copy().threeD[key];
  const format = (value) => Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : "N/A";
  const localError = (error) => copy().errors?.[error.code] || text("invalidConfiguration");

  function setMessage(key) {
    messageKey = key;
    let message = text(key);
    if (simulation && ["running", "imported", "end", "motionReduced"].includes(key)) {
      message += ` ${copy().stopReasons[simulation.result.stopReason]}`;
    }
    if (simulation && !simulation.properties.hasHorizon && key !== "webglError") {
      message += ` ${copy().overExtremalWarning}`;
    }
    $("#scene-status").textContent = message;
  }
  function updateLabels() {
    const c = copy();
    $("[data-mass-label]").textContent = unitMode === "physical" ? c.massLabelPhysical : c.massLabelGeometrized;
    $("[data-charge-label]").textContent = unitMode === "physical" ? c.chargeLabelPhysical : c.chargeLabelGeometrized;
    $("[data-angular-momentum-label]").textContent = unitMode === "physical" ? c.angularMomentumLabelPhysical : c.angularMomentumLabelGeometrized;
    document.querySelectorAll("[data-unit-mode]").forEach((button) => {
      const active = button.dataset.unitMode === unitMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("[data-preset-state]").textContent = preset ? `${c.activePreset}: ${c.presets[preset]}` : c.customConfiguration;
    $("#pause").textContent = text(paused ? "resume" : "pause");
  }
  function localize() {
    document.documentElement.lang = language;
    document.querySelectorAll("[data-i18n], [data-i18n-aria-label]").forEach((element) => {
      const key = element.dataset.i18n || element.dataset.i18nAriaLabel;
      const value = key.split(".").reduce((o, k) => o?.[k], copy());
      if (typeof value !== "string") return;
      if (element.dataset.i18n) element.textContent = value;
      else element.setAttribute("aria-label", value);
    });
    document.querySelectorAll("[data-lang]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.lang === language)));
    renderer?.domElement.setAttribute("aria-label", text("scene"));
    updateLabels();
    setMessage(messageKey);
    $("[data-simulation-status]").textContent = lastError ? localError(lastError) : formMessageKey ? text(formMessageKey) : "";
    updateEquivalents();
    renderDiagnostics();
  }
  function physicalInputs() {
    const mass = Number.parseFloat(field("mass").value);
    const charge = Number.parseFloat(field("charge").value);
    const angularMomentum = Number.parseFloat(field("angularMomentum").value);
    return unitMode === "physical" ? { massSolar: mass, chargeC: charge, angularMomentum }
      : P.geometrizedToPhysical({ massKm: mass, chargeKm: charge, angularMomentumKm2: angularMomentum });
  }
  function writePhysical(physical) {
    const geometry = P.physicalToGeometrized(physical);
    const values = unitMode === "physical"
      ? [physical.massSolar, physical.chargeC, physical.angularMomentum]
      : [geometry.massMeters / 1000, geometry.chargeMeters / 1000, geometry.angularMomentumMeters2 / 1e6];
    ["mass", "charge", "angularMomentum"].forEach((name, i) => { field(name).value = String(values[i]); });
  }
  function fillConfiguration(input) {
    const config = S.toLocalConfiguration(input);
    originalConfiguration = input.version === 1 ? S.validate(input) : null;
    unitMode = config.unitMode;
    preset = config.preset;
    photonEnergy = config.initial.photonEnergy;
    writePhysical(config.physical);
    field("object").value = config.initial.massive ? "massive" : "photon";
    for (const name of ["radius", "latitude", "azimuth", "elevation", "speed"]) {
      field(name).value = String(config.initial[name]);
    }
    if (config.initial.massive) previousMassiveSpeed = config.initial.speed;
    field("speed").disabled = !config.initial.massive;
    field("preset").value = preset || "custom";
    updateLabels();
    updateEquivalents();
  }
  function readConfiguration() {
    // Preserve the original state and affine normalization, not rounded UI values.
    if (originalConfiguration) return S.validate({ ...originalConfiguration, unitMode });
    return S.validate({ version: 2, unitMode, preset, physical: physicalInputs(),
      initial: { radius: Number.parseFloat(field("radius").value), latitude: Number.parseFloat(field("latitude").value),
        azimuth: Number.parseFloat(field("azimuth").value), elevation: Number.parseFloat(field("elevation").value),
        speed: field("object").value === "photon" ? 1 : Number.parseFloat(field("speed").value),
        massive: field("object").value === "massive", photonEnergy },
      maxLambda: preset ? S.presetConfiguration(preset, unitMode).maxLambda : P.NUMERICS.maxLambda });
  }
  function updateEquivalents() {
    $("[data-mass-kg]").textContent = format(physicalInputs().massSolar * P.SI.solarMass);
    const values = { energy: "—", momentum: "—", carter: "—" };
    try {
      const prepared = S.prepare(readConfiguration());
      const constants = P.conservedQuantities(prepared.params, prepared.initialState);
      values.energy = format(constants.energy); values.momentum = format(constants.angularMomentum);
      values.carter = format(constants.carter);
    } catch (_) { /* Incomplete or invalid fields must not show stale derived values. */ }
    $("[data-derived-energy]").textContent = values.energy;
    $("[data-derived-momentum]").textContent = values.momentum;
    $("[data-derived-carter]").textContent = values.carter;
  }
  function renderDiagnostics() {
    const target = $("#diagnostics");
    target.replaceChildren();
    if (!simulation) { target.textContent = text("noRun"); return; }
    const c = copy();
    const { result, properties } = simulation;
    const checks = result.checks;
    const rows = [
      [c.outerHorizon, properties.hasHorizon ? `${format(properties.outer)} M` : c.overExtremalWarning],
      [c.normalizationError, format(checks.normalizationError)],
      [c.energyChange, format(checks.relativeEnergyChange)],
      [c.momentumChange, checks.angularMomentumIsZero ? `|ΔL_z| = ${format(checks.absoluteAngularMomentumChange)}` : format(checks.relativeAngularMomentumChange)],
      [text("carterChange"), format(checks.scaledCarterChange)],
      [c.stopReason, c.stopReasons[result.stopReason]]
    ];
    rows.forEach(([label, value]) => {
      const dt = document.createElement("dt"); const dd = document.createElement("dd");
      dt.textContent = label; dd.textContent = value; target.append(dt, dd);
    });
  }
  function resetCamera() {
    if (!controls) return;
    const factor = viewRadius / 24 * layoutScale;
    camera.position.set(0, 15 * factor, 35 * factor);
    controls.target.set(0, 0, 0);
    controls.minDistance = Math.max(0.1, viewRadius / 30);
    controls.maxDistance = Math.max(100, viewRadius * 5) * layoutScale;
    camera.far = Math.max(1000, viewRadius * 10);
    camera.updateProjectionMatrix();
    controls.update();
  }
  function layoutScene() {
    if (!renderer || !controls) return;
    const container = $("#canvas-container");
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height) return;
    const bounds = container.getBoundingClientRect();
    const panel = $("#parameter-panel").getBoundingClientRect();
    const header = $(".scene-header").getBoundingClientRect();
    const footer = $("footer").getBoundingClientRect();
    let left = 0, top = Math.max(0, header.bottom - bounds.top);
    const bottom = Math.min(height, footer.top - bounds.top);
    if (width > 700 && $("#parameter-panel").open) left = panel.right - bounds.left + 16;
    if (width <= 700) top = Math.max(top, panel.bottom - bounds.top + 12);
    const availableWidth = Math.max(80, width - left);
    const availableHeight = Math.max(80, bottom - top);
    const nextScale = Math.max(1, height / availableHeight, 1.15 * height / availableWidth);
    camera.position.sub(controls.target).multiplyScalar(nextScale / layoutScale).add(controls.target);
    layoutScale = nextScale;
    controls.maxDistance = Math.max(100, viewRadius * 5) * layoutScale;
    camera.far = Math.max(1000, viewRadius * 10 * layoutScale);
    camera.aspect = width / height;
    // Keep the scene's target in the visible area, away from the controls.
    camera.setViewOffset(width, height, width / 2 - (left + width) / 2,
      height / 2 - (top + bottom) / 2, width, height);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    controls.update();
    renderer.render(scene, camera);
  }
  function failRenderer() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    setMessage("webglError");
    form.querySelector('[type="submit"]').disabled = true;
    $("#pause").disabled = true;
    $("#restart").disabled = true;
    $("#reset-camera").disabled = true;
  }
  const DISK_PARTICLE_COUNT = 25000;
  // Position, differential (Keplerian) rotation and a relativistic Doppler
  // beaming factor are computed live in the vertex shader from per-particle
  // attributes baked once (radius, initial angle, angular velocity, camera-
  // independent color); only the beaming factor depends on the live camera
  // position (the built-in `cameraPosition` uniform), so it reacts every
  // frame without re-baking anything on the CPU.
  const DISK_VERTEX_SHADER = `
    attribute float aRadius;
    attribute float aAngle0;
    attribute float aOmega;
    attribute float aHeight;
    attribute float aBeta;
    attribute vec3 aColor;
    uniform float uTime;
    uniform float uSpeedScale;
    uniform float uSize;
    varying vec3 vColor;
    varying float vDoppler;
    void main() {
      float angle = aAngle0 + aOmega * uTime * uSpeedScale;
      vec3 pos = vec3(aRadius * cos(angle), aHeight, aRadius * sin(angle));
      vec3 tangent = normalize(vec3(-sin(angle), 0.0, cos(angle)));
      vec3 toCamera = normalize(cameraPosition - pos);
      float beta = clamp(aBeta, 0.0, 0.999);
      float gamma = 1.0 / sqrt(1.0 - beta * beta);
      float cosAngle = dot(tangent, toCamera);
      vDoppler = 1.0 / (gamma * (1.0 - beta * cosAngle));
      vColor = aColor;
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = uSize * (300.0 / max(0.001, -mvPosition.z));
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  const DISK_FRAGMENT_SHADER = `
    precision mediump float;
    varying vec3 vColor;
    varying float vDoppler;
    void main() {
      vec2 uv = gl_PointCoord - vec2(0.5);
      float dist = length(uv);
      if (dist > 0.5) discard;
      // Approximate relativistic beaming (specific-intensity ~ D^3) plus a
      // mild hue skew toward blue when approaching, red when receding --
      // not a full spectral redshift, which would need a real spectrum.
      float intensity = pow(clamp(vDoppler, 0.2, 3.0), 3.0);
      vec3 shifted = vColor * intensity;
      float shift = clamp(vDoppler - 1.0, 0.0, 1.0);
      shifted.b *= mix(1.0, 1.3, shift);
      shifted.r *= mix(1.3, 1.0, shift);
      float alpha = (1.0 - smoothstep(0.05, 0.5, dist)) * 0.9;
      gl_FragColor = vec4(clamp(shifted, 0.0, 1.0), alpha);
    }
  `;

  function buildDisk(params) {
    // ISCO anchors the inner edge physically. Kerr-Newman (spin and charge
    // both nonzero) has no closed-form ISCO in this project (see
    // P.iscoRadius); a documented fallback uses the spin-only Kerr value
    // (charge dropped) for placement, while rotation/redshift/temperature
    // still use the real charged params, since keplerianAngularVelocity and
    // diskRedshiftFactor are derived directly from the metric and stay valid
    // for any (M, a, q).
    const fallbackParams = { M: params.M, a: params.a, q: 0 };
    const isco = P.iscoRadius(params) ?? P.iscoRadius(fallbackParams) ?? 6;
    const outer = isco * 4;
    const radii = new Float32Array(DISK_PARTICLE_COUNT);
    const angles = new Float32Array(DISK_PARTICLE_COUNT);
    const omegas = new Float32Array(DISK_PARTICLE_COUNT);
    const heights = new Float32Array(DISK_PARTICLE_COUNT);
    const betas = new Float32Array(DISK_PARTICLE_COUNT);
    const colors = new Float32Array(DISK_PARTICLE_COUNT * 3);
    // The shader computes the real (orbiting) position from aRadius/aAngle0/
    // aOmega, but THREE.BufferGeometry still needs a standard "position"
    // attribute to know the vertex count and a bounding sphere for draw
    // calls and frustum culling -- without one, WebGLRenderer silently
    // renders nothing. It is seeded here with the t=0 layout (a fixed,
    // roughly correct bounding volume) and never read by the shader.
    const seedPositions = new Float32Array(DISK_PARTICLE_COUNT * 3);
    for (let i = 0; i < DISK_PARTICLE_COUNT; i += 1) {
      const r = isco + Math.random() * (outer - isco);
      const angle0 = Math.random() * 2 * Math.PI;
      const omega = P.keplerianAngularVelocity(params, r, "prograde") ?? 0;
      const redshift = P.diskRedshiftFactor(params, r, "prograde");
      const temperature = P.diskTemperature(params, r, "prograde", 20000, isco) ?? 0;
      const frame = P.zamoFrame(params, r, Math.PI / 2);
      const beta = Math.min(0.999, Math.abs((omega - frame.omega) * frame.azimuthalScale / frame.lapse));
      const color = P.blackbodyColor(temperature * (redshift ?? 1));
      const height = (Math.random() - 0.5) * (outer - r) * 0.12;
      radii[i] = r;
      angles[i] = angle0;
      omegas[i] = omega;
      heights[i] = height;
      betas[i] = beta;
      colors.set([color.r, color.g, color.b], i * 3);
      seedPositions.set([r * Math.cos(angle0), height, r * Math.sin(angle0)], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(seedPositions, 3));
    geometry.setAttribute("aRadius", new THREE.BufferAttribute(radii, 1));
    geometry.setAttribute("aAngle0", new THREE.BufferAttribute(angles, 1));
    geometry.setAttribute("aOmega", new THREE.BufferAttribute(omegas, 1));
    geometry.setAttribute("aHeight", new THREE.BufferAttribute(heights, 1));
    geometry.setAttribute("aBeta", new THREE.BufferAttribute(betas, 1));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: diskClock }, uSpeedScale: { value: 60 }, uSize: { value: 1 } },
      vertexShader: DISK_VERTEX_SHADER,
      fragmentShader: DISK_FRAGMENT_SHADER,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    if (disk) { scene.remove(disk); disk.geometry.dispose(); disk.material.dispose(); }
    disk = new THREE.Points(geometry, material);
    scene.add(disk);
    return { isco, outer };
  }

  // Purely illustrative disk shown only before the first successful run (see
  // createScene()): fixed [6,24] radial range, a static white-to-rust-orange
  // gradient, a tilted plane, and rigid rotation -- matching the original
  // reference scene in
  // Codex.context-Blackholesimulator/3D-Simulator_Good_Graphic.html:65-92,114-121.
  // Not anchored to any physical quantity. The moment a simulation runs,
  // setGeometry() calls buildDisk(params) instead, which permanently
  // replaces this object with the ISCO-anchored, shader-driven one.
  function buildDecorativeDisk() {
    const positions = new Float32Array(DISK_PARTICLE_COUNT * 3);
    const colors = new Float32Array(DISK_PARTICLE_COUNT * 3);
    const inside = new THREE.Color(0xffffff);
    const outside = new THREE.Color(0xaa2200);
    for (let i = 0; i < DISK_PARTICLE_COUNT; i += 1) {
      const r = 6 + Math.random() * 18;
      const theta = Math.random() * 2 * Math.PI;
      const height = (Math.random() - 0.5) * (24 - r) * 0.12;
      const color = inside.clone().lerp(outside, (r - 6) / 18);
      positions.set([r * Math.cos(theta), height, r * Math.sin(theta)], i * 3);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.08, vertexColors: true, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0.9, depthWrite: false
    });
    if (disk) { scene.remove(disk); disk.geometry.dispose(); disk.material.dispose(); }
    disk = new THREE.Points(geometry, material);
    disk.rotation.x = Math.PI / 7;
    disk.rotation.z = Math.PI / 10;
    scene.add(disk);
  }

  // Physical ergosphere surface: the theta-dependent outer static limit
  // (P.outerStaticLimitAtTheta, g_tt = 0), revolved around the spin axis.
  // Unlike a sphere, this is genuinely oblate -- it bulges out at the
  // equator and is exactly tangent to the horizon at the poles. Only exists
  // for spinning/charged holes where the ergoregion is nonempty (matching
  // the 2D simulator's own visibility condition); for Schwarzschild (a=0,
  // q=0) outerStaticLimitAtTheta equals the horizon everywhere and no
  // ergosphere is drawn.
  function buildErgosphere(params, horizons) {
    if (ergosphere) { scene.remove(ergosphere); ergosphere.geometry.dispose(); ergosphere.material.dispose(); }
    if (ergosphereWire) { scene.remove(ergosphereWire); ergosphereWire.material.dispose(); }
    ergosphere = null; ergosphereWire = null;
    const equatorialLimit = horizons.hasHorizon ? P.outerStaticLimitAtTheta(params, Math.PI / 2) : null;
    if (!horizons.hasHorizon || equatorialLimit === null || equatorialLimit <= horizons.outer) return;
    const profile = [];
    const segments = 48;
    for (let i = 0; i <= segments; i += 1) {
      const theta = (i / segments) * Math.PI;
      const r = P.outerStaticLimitAtTheta(params, theta);
      profile.push(new THREE.Vector2(r * Math.sin(theta), r * Math.cos(theta)));
    }
    const geometry = new THREE.LatheGeometry(profile, 48);
    ergosphere = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0xd4b483, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false
    }));
    // A faint fill alone is easy to miss; a wireframe overlay on the same
    // geometry makes the boundary itself clearly legible, matching how the
    // 2D view pairs a low-opacity fill with a distinct stroke outline.
    ergosphereWire = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0xd4b483, wireframe: true, transparent: true, opacity: 0.35, depthWrite: false
    }));
    scene.add(ergosphere, ergosphereWire);
  }

  // Below the ISCO no stable circular orbit exists: gas that reaches it
  // plunges toward the horizon on a dynamical (near free-fall) timescale
  // instead of the slow viscous inspiral that maintains the disk above it.
  // This seeds a handful of real geodesics with the ISCO circular orbit's
  // own (E, L) -- P.circularOrbitFourVelocity, P.initialStateFromConstants
  // and P.integrateGeodesic are the exact same functions used everywhere
  // else, no new physics module -- starting slightly inside the ISCO
  // (exactly at the ISCO the radial velocity is marginally zero, an
  // unstable equilibrium that takes an unbounded affine time to visibly
  // depart from) and integrates them to the horizon margin. Color is frozen
  // at the temperature the gas had just above the ISCO (the Novikov-Thorne
  // profile's own T=0 exactly at the ISCO is a zero-torque boundary
  // condition, not a statement that the gas itself went dark) and then
  // dimmed/reddened along the fall using the geodesic's own local redshift
  // g = 1/u^t (state[4]), the same ratio already used for the stable disk.
  //
  // Each stream's full (lambda, position, color) sample table is kept, not
  // flattened into a static point cloud: gas falling from the ISCO to the
  // horizon is a continuous, ongoing flow (there is always more gas
  // arriving), not a single blob that fell once and now sits frozen in
  // space, so updatePlungingRegion() animates several time-phase-staggered
  // "parcels" per stream every frame -- the same sample-table-plus-cursor
  // technique updatePlayback() already uses for the main trajectory,
  // applied per stream instead of once.
  const PLUNGE_PARTICLES_PER_STREAM = 5;
  // Real seconds per M of the fall's own affine time. Deliberately smaller
  // than the disk's uSpeedScale (60): the plunge happens on a dynamical
  // (near free-fall) timescale, genuinely much shorter than the disk's
  // viscous orbital period -- a Schwarzschild fall from just inside the
  // ISCO (lambda_end ~ 45M) takes ~3s at this scale, and higher-spin holes
  // fall faster still purely because their own lambda_end shrinks (verified
  // numerically), with no extra per-spin tuning needed.
  const PLUNGE_SPEED_SCALE = 15;
  function buildPlungingRegion(params, isco, horizonOuter) {
    if (plungingRegion) { scene.remove(plungingRegion); plungingRegion.geometry.dispose(); plungingRegion.material.dispose(); }
    plungingRegion = null;
    plungingStreams = [];
    const orbit = P.circularOrbitFourVelocity(params, isco, "prograde");
    if (!orbit) return;
    const baseTemperature = P.diskTemperature(params, isco * 1.05, "prograde", 20000, isco);
    if (!baseTemperature) return;
    // Seed 85% of the way from the horizon to the ISCO (i.e. just inside the
    // ISCO), the same qualitative starting point as before -- but expressed
    // as a fraction of the horizon-ISCO *gap* rather than a flat 0.9*isco.
    // For a near-extremal Kerr hole that gap can shrink well below 1 M
    // (e.g. a* = 0.9999 gives isco - horizon =~ 0.06M), and 0.9*isco can
    // then land *inside* the horizon, where a seed is meaningless. Anchoring
    // to the gap itself keeps the seed strictly between horizon and ISCO for
    // any spin/charge; verified numerically (node) to stay valid up to
    // a* = 0.99 (presets only reach 0.7), degrading gracefully -- no seed,
    // no plunging region, no crash -- via the existing try/catch below for
    // the small remaining sliver of near-extremal spin where the engine's
    // own coordinate-margin guard rejects any point that close to a horizon.
    const seedRadius = horizonOuter + (isco - horizonOuter) * 0.85;
    const streamCount = 8;
    for (let stream = 0; stream < streamCount; stream += 1) {
      let seed;
      let result;
      try {
        seed = P.initialStateFromConstants(params, {
          radius: seedRadius, energy: orbit.energy, angularMomentum: orbit.angularMomentum,
          massive: true, radialDirection: "ingoing"
        });
        seed[3] = (stream / streamCount) * 2 * Math.PI; // spread streams around the ring; phi does not affect the axisymmetric physics
        result = P.integrateGeodesic(params, seed, { guardCoordinates: true, maxLambda: 100, step: 0.01, maxSteps: 10000 });
      } catch (_) {
        continue;
      }
      // Thin the raw samples out to ~40 per stream instead of every RK4
      // step, and reconstruct each kept sample's own affine time the same
      // way showSimulation() builds `times` for the main trajectory (the
      // solver stores the initial state, step 1, then every sampleEvery
      // steps) -- needed here so updatePlungingRegion() can interpolate by
      // elapsed lambda, not just by array index.
      const { settings } = result;
      const stride = Math.max(1, Math.floor(result.points.length / 40));
      const lambdas = [];
      const streamPositions = [];
      const streamColors = [];
      for (let i = 0; i < result.points.length; i += stride) {
        const state = result.points[i];
        const [, r, theta, phi, uT] = state;
        // A geodesic can end on (or pass through, before the guard catches
        // it) a non-finite or sub-horizon state -- skip any such sample
        // rather than uploading a NaN/inf vertex into the render buffer,
        // which would otherwise poison the whole Points object's bounding
        // sphere.
        if (![r, theta, phi, uT].every(Number.isFinite) || r <= horizonOuter) continue;
        lambdas.push(i === 0 ? 0 : (1 + (i - 1) * settings.sampleEvery) * settings.step);
        streamPositions.push(new THREE.Vector3(r * Math.sin(theta) * Math.cos(phi), r * Math.cos(theta), r * Math.sin(theta) * Math.sin(phi)));
        const localG = uT > 0 ? 1 / uT : 0;
        streamColors.push(P.blackbodyColor(baseTemperature * localG));
      }
      // Need at least two samples to interpolate between; a stream reduced
      // to a single valid sample (an extremely short-lived near-extremal
      // fall) cannot be animated and is dropped.
      if (lambdas.length < 2) continue;
      plungingStreams.push({ lambdas, positions: streamPositions, colors: streamColors, lambdaEnd: lambdas[lambdas.length - 1] });
    }
    if (plungingStreams.length === 0) return;
    const particleCount = plungingStreams.length * PLUNGE_PARTICLES_PER_STREAM;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3));
    plungingRegion = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.05, vertexColors: true, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0.65, depthWrite: false
    }));
    scene.add(plungingRegion);
    updatePlungingRegion();
  }

  // Advances the plunging region's rendered gas parcels along their own
  // precomputed per-stream tables, driven by diskClock (already correctly
  // paused/resumed and reduced-motion-gated by animate(), so this needs no
  // separate clock or pause bookkeeping of its own). Several time-phase-
  // staggered "generations" per stream keep gas continuously visible along
  // the whole fall instead of one point popping back to the ISCO each loop.
  function updatePlungingRegion() {
    if (!plungingRegion) return;
    const positionsAttribute = plungingRegion.geometry.attributes.position.array;
    const colorsAttribute = plungingRegion.geometry.attributes.color.array;
    let cursor = 0;
    for (const stream of plungingStreams) {
      const { lambdas, positions: streamPositions, colors: streamColors, lambdaEnd } = stream;
      for (let generation = 0; generation < PLUNGE_PARTICLES_PER_STREAM; generation += 1) {
        const phase = generation * (lambdaEnd / PLUNGE_PARTICLES_PER_STREAM);
        let localLambda = (diskClock * PLUNGE_SPEED_SCALE + phase) % lambdaEnd;
        if (localLambda < 0) localLambda += lambdaEnd;
        let index = 0;
        while (index < lambdas.length - 2 && lambdas[index + 1] <= localLambda) index += 1;
        const nextIndex = Math.min(index + 1, lambdas.length - 1);
        const interval = lambdas[nextIndex] - lambdas[index];
        const fraction = interval > 0 ? Math.min(1, Math.max(0, (localLambda - lambdas[index]) / interval)) : 0;
        const p0 = streamPositions[index], p1 = streamPositions[nextIndex];
        const c0 = streamColors[index], c1 = streamColors[nextIndex];
        const base = cursor * 3;
        positionsAttribute[base] = p0.x + (p1.x - p0.x) * fraction;
        positionsAttribute[base + 1] = p0.y + (p1.y - p0.y) * fraction;
        positionsAttribute[base + 2] = p0.z + (p1.z - p0.z) * fraction;
        colorsAttribute[base] = c0.r + (c1.r - c0.r) * fraction;
        colorsAttribute[base + 1] = c0.g + (c1.g - c0.g) * fraction;
        colorsAttribute[base + 2] = c0.b + (c1.b - c0.b) * fraction;
        cursor += 1;
      }
    }
    plungingRegion.geometry.attributes.position.needsUpdate = true;
    plungingRegion.geometry.attributes.color.needsUpdate = true;
  }

  // Recomputes the 1-D gravitational-lensing deflection table (see
  // P.computeLensingTable) for the current physical parameters and camera
  // distance. This is a real, if bounded, computation (tens to a couple
  // hundred milliseconds), so it is only called when the configuration or
  // camera framing changes -- not every animation frame.
  function updateLensingTable(params) {
    try {
      // 1 M-unit = 1 scene-unit globally (see setGeometry()), so the
      // camera-to-target scene distance is already the right M-unit radius.
      const cameraRadiusM = Math.max(camera.position.distanceTo(controls.target), 4);
      lensingTable = P.computeLensingTable(params, { cameraRadius: cameraRadiusM });
    } catch (_) {
      // Lensing is a display enhancement layered on top of the geodesic
      // simulator; if the table cannot be built the scene still renders
      // correctly without it (stars simply keep their true positions).
      lensingTable = null;
    }
  }

  function angularDeflectionFor(angleDegrees) {
    const escaped = lensingTable?.samples.filter((sample) => sample.deflection !== null) ?? [];
    if (escaped.length < 2 || angleDegrees <= escaped[0].angle) return 0;
    if (angleDegrees >= escaped[escaped.length - 1].angle) return escaped[escaped.length - 1].deflection;
    let lo = escaped[0];
    let hi = escaped[escaped.length - 1];
    for (let i = 1; i < escaped.length; i += 1) {
      if (escaped[i].angle >= angleDegrees) { hi = escaped[i]; lo = escaped[i - 1]; break; }
    }
    const t = (angleDegrees - lo.angle) / (hi.angle - lo.angle);
    return lo.deflection + t * (hi.deflection - lo.deflection);
  }

  const toStarDirection = new THREE.Vector3();
  const toBlackHoleDirection = new THREE.Vector3();
  const perpDirection = new THREE.Vector3();
  const newStarDirection = new THREE.Vector3();
  // Displaces each star's rendered position by the lensing table's
  // deflection at its own true angular offset from the black hole, as a
  // first-order approximation of the true (harder to invert) apparent
  // position -- see the "Deflection is measured..." note on
  // P.computeLensingTable for why this is an approximation, not exact
  // multiple-imaging near the photon sphere.
  function applyLensing() {
    if (!stars || !starOriginalPositions) return;
    const positionsAttribute = stars.geometry.attributes.position.array;
    if (!lensingTable) {
      positionsAttribute.set(starOriginalPositions);
      stars.geometry.attributes.position.needsUpdate = true;
      return;
    }
    toBlackHoleDirection.copy(controls.target).sub(camera.position).normalize();
    const maxAngle = lensingTable.samples[lensingTable.samples.length - 1].angle;
    for (let i = 0; i < starOriginalPositions.length; i += 3) {
      toStarDirection.set(starOriginalPositions[i], starOriginalPositions[i + 1], starOriginalPositions[i + 2])
        .sub(camera.position);
      const starDistance = toStarDirection.length() || 1;
      toStarDirection.divideScalar(starDistance);
      const cosAngle = Math.min(1, Math.max(-1, toStarDirection.dot(toBlackHoleDirection)));
      const angleDeg = Math.acos(cosAngle) * 180 / Math.PI;
      const deflection = angleDeg > 0 && angleDeg <= maxAngle ? angularDeflectionFor(angleDeg) : 0;
      if (!deflection) {
        positionsAttribute[i] = starOriginalPositions[i];
        positionsAttribute[i + 1] = starOriginalPositions[i + 1];
        positionsAttribute[i + 2] = starOriginalPositions[i + 2];
        continue;
      }
      const correctedRad = Math.max(0.01, angleDeg - deflection) * Math.PI / 180;
      perpDirection.copy(toStarDirection).addScaledVector(toBlackHoleDirection, -cosAngle).normalize();
      newStarDirection.copy(toBlackHoleDirection).multiplyScalar(Math.cos(correctedRad))
        .addScaledVector(perpDirection, Math.sin(correctedRad));
      positionsAttribute[i] = camera.position.x + newStarDirection.x * starDistance;
      positionsAttribute[i + 1] = camera.position.y + newStarDirection.y * starDistance;
      positionsAttribute[i + 2] = camera.position.z + newStarDirection.z * starDistance;
    }
    stars.geometry.attributes.position.needsUpdate = true;
  }

  function createScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    $("#canvas-container").append(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", text("scene"));
    renderer.domElement.addEventListener("webglcontextlost", (event) => { event.preventDefault(); failRenderer(); });
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    // Preserve reference orbit/pan/zoom; add keyboard equivalents on the canvas only.
    renderer.domElement.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-"].includes(event.key)) return;
      event.preventDefault();
      const delta = camera.position.clone().sub(controls.target);
      if (["+", "=", "-"].includes(event.key)) {
        delta.multiplyScalar(event.key === "-" ? 1.1 : 1 / 1.1);
        delta.clampLength(controls.minDistance, controls.maxDistance);
      } else if (event.shiftKey) {
        const horizontal = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        const vertical = event.key === "ArrowDown" ? -1 : event.key === "ArrowUp" ? 1 : 0;
        const offset = new THREE.Vector3(horizontal, vertical, 0).applyQuaternion(camera.quaternion).multiplyScalar(delta.length() * 0.04);
        controls.target.add(offset);
      } else {
        const spherical = new THREE.Spherical().setFromVector3(delta);
        spherical.theta += event.key === "ArrowLeft" ? 0.08 : event.key === "ArrowRight" ? -0.08 : 0;
        spherical.phi += event.key === "ArrowUp" ? -0.08 : event.key === "ArrowDown" ? 0.08 : 0;
        spherical.makeSafe(); delta.setFromSpherical(spherical);
      }
      camera.position.copy(controls.target).add(delta); controls.update();
    });
    blackHole = new THREE.Mesh(new THREE.SphereGeometry(5, 64, 64), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    scene.add(blackHole);
    // Non-physical, decorative disk shown until the first successful run
    // (see buildDecorativeDisk()); buildDisk() takes over permanently from
    // setGeometry() once a simulation actually executes.
    // No scaling here: blackHole stays at its raw geometry radius (5) until
    // the first run, and the decorative disk's r=[6,24] range is defined in
    // that same unscaled coordinate system, matching the reference scene
    // exactly (blackHole radius 5, disk starting at r=6).
    buildDecorativeDisk();
    const starPositions = new Float32Array(4000 * 3); const starColors = new Float32Array(4000 * 3);
    for (let i = 0; i < starPositions.length; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 500;
      starPositions[i + 1] = (Math.random() - 0.5) * 500;
      starPositions[i + 2] = (Math.random() - 0.5) * 500;
      const color = new THREE.Color().setHSL(0.6 + Math.random() * 0.1, 0.8, 0.5 + Math.random() * 0.5);
      starColors.set([color.r, color.g, color.b], i);
    }
    starOriginalPositions = starPositions.slice();
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 0.4, vertexColors: true, transparent: true, opacity: 0.8 }));
    scene.add(stars);
    // transparent:true so opacity can fade the marker as it nears a
    // horizon-margin stop (see updatePlayback()); opaque MeshBasicMaterial
    // ignores .opacity entirely.
    particle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), new THREE.MeshBasicMaterial({ color: 0x66ffff, transparent: true }));
    particle.visible = false; scene.add(particle);
    resetCamera();
    // No lensing table yet: the decorative intro is non-physical, and
    // applyLensing() already leaves stars at their true positions while
    // lensingTable is null. The first real table is built in
    // showSimulation() once a simulation runs.
    const observer = new ResizeObserver(layoutScene);
    for (const selector of ["#canvas-container", ".scene-header", "#parameter-panel", "footer"]) observer.observe($(selector));
    $("#parameter-panel").addEventListener("toggle", layoutScene);
    window.addEventListener("resize", layoutScene);
    layoutScene();
    // Draw immediately: a preview must not depend on a run or valid form fields.
    renderer.render(scene, camera);
  }

  function setGeometry(config) {
    const params = P.dimensionlessParameters(config.physical);
    const horizons = P.horizonData(params);
    // Only blackHole needs `scale`: its geometry has an arbitrary raw radius
    // (5) with no physical meaning, and `scale = horizons.outer/5` maps it
    // to the true horizon radius in M-units. The disk, the ergosphere and
    // the trajectory/particle all build their geometry directly from
    // physics-engine radii already expressed in M-units -- by this same
    // convention that makes 1 M-unit = 1 scene-unit, they must NOT be
    // scaled again, or their true size relative to the horizon is lost
    // (previously the disk/ergosphere were scaled twice, visibly shrinking
    // them so far the disk crept inside the horizon sphere).
    const scale = horizons.hasHorizon ? horizons.outer / 5 : 0.4;
    blackHole.visible = horizons.hasHorizon;
    blackHole.scale.setScalar(scale);
    const { isco, outer: diskOuter } = buildDisk(params);
    disk.material.uniforms.uSize.value = 0.08 * scale * 40;
    disk.material.uniforms.uTime.value = diskClock;
    disk.visible = diskVisible;
    // The plunging region is disk material past its stable inner edge, so
    // it shares the disk's own visibility toggle rather than a separate one.
    buildPlungingRegion(params, isco, horizons.outer);
    if (plungingRegion) plungingRegion.visible = diskVisible;
    buildErgosphere(params, horizons);
    if (ergosphere) { ergosphere.visible = ergosphereVisible; ergosphereWire.visible = ergosphereVisible; }
    // *2: leave visible margin beyond the disk's outer edge for background
    // stars and lensing to read -- framing exactly at diskOuter (the old
    // formula) put the disk's rim against the viewport edge, crowding out
    // everything around it.
    viewRadius = Math.max(config.initial.radius * 1.5, diskOuter * 2);
    particle.scale.setScalar(Math.max(0.3, scale));
    return params;
  }
  function showSimulation(next) {
    simulation = next;
    points = next.result.points.slice();
    const { settings } = next.result;
    // The solver stores the initial state, step 1, then every sampleEvery steps.
    times = points.map((_, i) => i === 0 ? 0 : (1 + (i - 1) * settings.sampleEvery) * settings.step);
    const final = next.result.finalState;
    if (next.result.stopReason !== "nonFinite" && final.every(Number.isFinite) && final[1] > 0 && next.result.lambda > times[times.length - 1] + 1e-9) {
      points.push(final); times.push(next.result.lambda);
    }
    positions = points.map((state) => new THREE.Vector3(state[1] * Math.sin(state[2]) * Math.cos(state[3]), state[1] * Math.cos(state[2]), state[1] * Math.sin(state[2]) * Math.sin(state[3])));
    // g = 1/u^t (state[4]) is the same local redshift factor already used
    // to color the disk/plunging region, here applied to the test-particle
    // itself; t (state[0]) is the Boyer-Lindquist coordinate time the
    // solver integrates alongside the affine parameter lambda but never
    // otherwise surfaces. Both grow/shrink together as a trajectory nears
    // the horizon-margin stop: g -> 0 while t races far ahead of lambda --
    // the calculated analogue of a distant observer never actually seeing
    // anything cross the horizon, only freezing and redshifting toward it.
    // Clamped at 1 so a trajectory that never approaches the horizon (most
    // of them) shows no visible tint at all, only ever dimming below it.
    redshifts = points.map((state) => state[4] > 0 && Number.isFinite(state[4]) ? Math.min(1, 1 / state[4]) : 1);
    tValues = points.map((state) => state[0]);
    if (trajectory) { scene.remove(trajectory); trajectory.geometry.dispose(); trajectory.material.dispose(); }
    // An equatorial trajectory sitting at disk radius would otherwise be
    // visually swallowed by the disk's dense, additively-blended particles
    // (which ADD brightness regardless of geometric depth). transparent +
    // depthTest:false, combined with a renderOrder higher than the disk's
    // default (0), moves the line into its own final pass that always
    // draws its own solid color on top, unaffected by what is underneath.
    // Vertex colors (baked once here, not updated per frame -- the line is
    // already redrawn progressively via setDrawRange as playback advances)
    // fade each already-computed vertex from the base cyan toward a dim red
    // as its own redshift falls, so the final stretch approaching a
    // horizon-margin stop visibly dims/reddens while the rest of the line
    // (redshift close to 1) stays effectively unchanged.
    const baseTrajectoryColor = new THREE.Color(0x66ffff);
    const dimTrajectoryColor = new THREE.Color(0x330000);
    const lineColors = new Float32Array(redshifts.length * 3);
    redshifts.forEach((g, i) => {
      const shade = baseTrajectoryColor.clone().lerp(dimTrajectoryColor, 1 - Math.min(1, Math.max(0, g)));
      lineColors.set([shade.r, shade.g, shade.b], i * 3);
    });
    const trajectoryGeometry = new THREE.BufferGeometry().setFromPoints(positions);
    trajectoryGeometry.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));
    const trajectoryMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false });
    trajectory = new THREE.Line(trajectoryGeometry, trajectoryMaterial);
    trajectory.renderOrder = 10;
    scene.add(trajectory);
    endTime = times[times.length - 1];
    affineTime = 0; sampleIndex = 0; paused = reducedMotion.matches;
    const params = setGeometry(next.config);
    resetCamera();
    updateLensingTable(params);
    particle.visible = true;
    $("#pause").disabled = false; $("#restart").disabled = false;
    updatePlayback(); updateLabels(); renderDiagnostics();
  }
  const PARTICLE_BASE_COLOR = new THREE.Color(0x66ffff);
  const PARTICLE_DIM_COLOR = new THREE.Color(0x330000);
  const particleShade = new THREE.Color();
  function updatePlayback() {
    if (!simulation) return;
    while (sampleIndex < times.length - 2 && times[sampleIndex + 1] <= affineTime) sampleIndex++;
    const nextIndex = Math.min(sampleIndex + 1, positions.length - 1);
    const interval = times[nextIndex] - times[sampleIndex];
    const fraction = interval > 0 ? Math.min(1, Math.max(0, (affineTime - times[sampleIndex]) / interval)) : 0;
    particle.position.copy(positions[sampleIndex]).lerp(positions[nextIndex], fraction);
    // Same redshift g = 1/u^t used for the trajectory line's own vertex
    // colors, interpolated the same way as position, applied to the marker
    // itself: it visibly dims and reddens only in the final stretch before
    // a horizon-margin stop (floor at 0.35 opacity so it never vanishes
    // outright -- this is a visualization of the effect, not a claim that
    // the particle itself goes dark).
    const g = Math.min(1, Math.max(0, redshifts[sampleIndex] + (redshifts[nextIndex] - redshifts[sampleIndex]) * fraction));
    particle.material.opacity = 0.35 + 0.65 * g;
    particle.material.color.copy(particleShade.copy(PARTICLE_BASE_COLOR).lerp(PARTICLE_DIM_COLOR, 1 - g));
    trajectory.geometry.setDrawRange(0, affineTime >= endTime ? positions.length : sampleIndex + 1);
    // t is the Boyer-Lindquist coordinate time (state[0]), interpolated the
    // same way; shown next to lambda as concrete evidence of why the marker
    // seems to freeze near a horizon-margin stop -- t grows much faster
    // than the affine parameter lambda there (see showSimulation()).
    const t = tValues[sampleIndex] + (tValues[nextIndex] - tValues[sampleIndex]) * fraction;
    $("#affine-time").textContent = `λ = ${affineTime.toFixed(2)} / ${endTime.toFixed(2)} · t = ${format(t)} M`;
  }
  function animate(now) {
    frame = null;
    if (document.hidden || renderer.getContext().isContextLost()) return;
    const elapsed = previousTime === null ? 0 : Math.min((now - previousTime) / 1000, 0.1);
    previousTime = now;
    if (!paused && simulation) {
      affineTime = Math.min(endTime, affineTime + elapsed * 4);
      updatePlayback();
      if (affineTime >= endTime) { paused = true; updateLabels(); setMessage("end"); }
    }
    if (!reducedMotion.matches && (!simulation || !paused)) {
      diskClock += elapsed;
      // The decorative intro disk (PointsMaterial) has no shader uniforms;
      // it spins rigidly instead, the same way the physical disk did before
      // it moved to per-particle Keplerian rotation.
      if (disk.material.uniforms) disk.material.uniforms.uTime.value = diskClock;
      else disk.rotation.y -= elapsed * 0.18;
    }
    updatePlungingRegion();
    controls.update();
    applyLensing();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  function startFrames() {
    previousTime = null;
    if (frame === null && renderer && !document.hidden) frame = requestAnimationFrame(animate);
  }
  async function run(config, imported = false) {
    if (computing) return;
    computing = true;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true; form.setAttribute("aria-busy", "true");
    setMessage("computing"); lastError = null;
    // Paint the busy state before the bounded synchronous solver runs.
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      showSimulation(S.run(config));
      formMessageKey = ""; $("[data-simulation-status]").textContent = "";
      setMessage(reducedMotion.matches ? "motionReduced" : imported ? "imported" : "running");
      if (window.matchMedia("(max-width: 700px)").matches) $("#parameter-panel").open = false;
    } catch (error) {
      lastError = error;
      $("[data-simulation-status]").textContent = localError(error);
      setMessage("ready");
      $("#parameter-panel").open = true;
    } finally {
      computing = false; submit.disabled = false; form.removeAttribute("aria-busy");
    }
  }
  form.addEventListener("invalid", (event) => {
    $("#parameter-panel").open = true;
    const details = event.target.closest("details");
    if (details) details.open = true;
  }, true);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try { run(readConfiguration()); }
    catch (error) { lastError = error; $("[data-simulation-status]").textContent = localError(error); }
  });
  form.addEventListener("input", (event) => {
    try {
      if (event.target.name === "preset") {
        fillConfiguration(S.presetConfiguration(field("preset").value, unitMode));
      } else if (event.target.matches("input, select")) {
        originalConfiguration = null;
        photonEnergy = 1;
        preset = null; field("preset").value = "custom";
        if (event.target.name === "object") {
          const massive = field("object").value === "massive";
          if (!massive) previousMassiveSpeed = Number.parseFloat(field("speed").value);
          field("speed").value = massive ? String(previousMassiveSpeed) : "1";
          field("speed").disabled = !massive;
        }
        updateEquivalents(); updateLabels();
      }
      lastError = null; formMessageKey = simulation ? "changed" : "ready";
      $("[data-simulation-status]").textContent = text(formMessageKey);
    } catch (error) {
      lastError = error;
      $("[data-simulation-status]").textContent = localError(error);
    }
  });
  document.querySelectorAll("[data-unit-mode]").forEach((button) => button.addEventListener("click", () => {
    const physical = physicalInputs();
    if (![physical.massSolar, physical.chargeC, physical.angularMomentum].every(Number.isFinite)) {
      formMessageKey = "invalidConfiguration"; $("[data-simulation-status]").textContent = text(formMessageKey); return;
    }
    unitMode = button.dataset.unitMode; writePhysical(physical); updateLabels(); updateEquivalents();
  }));
  document.querySelectorAll("[data-lang]").forEach((button) => button.addEventListener("click", () => {
    language = button.dataset.lang;
    try { localStorage.setItem("portfolio-language", language); } catch (_) { /* Optional persistence. */ }
    localize();
  }));
  $("#pause").addEventListener("click", () => {
    if (affineTime >= endTime) { affineTime = 0; sampleIndex = 0; }
    paused = !paused; updateLabels(); setMessage(paused ? "pause" : "running");
  });
  $("#restart").addEventListener("click", () => {
    affineTime = 0; sampleIndex = 0; paused = reducedMotion.matches;
    updatePlayback(); updateLabels(); setMessage(paused ? "motionReduced" : "running");
  });
  $("#reset-camera").addEventListener("click", resetCamera);
  $("#disk-toggle").addEventListener("change", (event) => {
    diskVisible = event.target.checked;
    disk.visible = diskVisible;
    if (plungingRegion) plungingRegion.visible = diskVisible;
  });
  $("#ergosphere-toggle").addEventListener("change", (event) => {
    ergosphereVisible = event.target.checked;
    if (ergosphere) { ergosphere.visible = ergosphereVisible; ergosphereWire.visible = ergosphereVisible; }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (frame !== null) cancelAnimationFrame(frame); frame = null; previousTime = null; }
    else startFrames();
  });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches && simulation) { paused = true; updateLabels(); setMessage("motionReduced"); }
  });
  // Build the visual preview before any configuration conversion can fail.
  if (window.matchMedia("(max-width: 700px)").matches) $("#parameter-panel").open = false;
  localize();
  try { createScene(); } catch (_) { failRenderer(); return; }
  startFrames();
  try { fillConfiguration(S.presetConfiguration()); }
  catch (error) { lastError = error; $("[data-simulation-status]").textContent = localError(error); }
  const query = new URLSearchParams(location.search);
  const transferred = !query.has("manual") && query.has("from2d") ? S.load3DTransfer() : null;
  const stored = query.has("manual") ? { config: null, error: false } : transferred || S.load();
  if (stored.config) {
    try {
      fillConfiguration(stored.config);
      if (!transferred || transferred.autoRun) run(stored.config, true);
      else setMessage("importedFields");
    } catch (error) {
      lastError = error; $("[data-simulation-status]").textContent = localError(error);
      $("#parameter-panel").open = true;
    }
  } else if (stored.error || transferred) setMessage("storageError");
}());
