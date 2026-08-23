(function () {
  "use strict";

  const P = window.KerrNewmanPhysics;
  if (!P) return;

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

  let elements;
  let unitMode = "physical";
  let language = "it";
  let currentPhysical = null;
  let currentParams = null;
  let currentSpacetime = null;
  let lastSimulation = null;
  let activePreset = "photonCapture";
  let initialized = false;
  let validationResult = null;
  let validationError = null;
  let validationPromise = null;

  const numberValue = (input) => Number.parseFloat(input.value);
  const isFiniteNumber = (value) => Number.isFinite(value);
  const formatNumber = (value, digits = 6) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
    if (value === 0) return "0";
    const magnitude = Math.abs(value);
    if (magnitude >= 1e5 || magnitude < 1e-4) return value.toExponential(4);
    return value.toFixed(digits).replace(/\.?0+$/, "");
  };

  function content() {
    return window.PORTFOLIO_CONTENT?.[language]?.blackHoleSimulator || {};
  }

  function localizedError(error) {
    return content().errors?.[error.code] || content().errors?.unexpected || error.message;
  }

  function cacheElements() {
    elements = {
      form: document.querySelector("[data-simulator-form]"),
      mass: document.querySelector("#bh-mass"),
      charge: document.querySelector("#bh-charge"),
      angularMomentum: document.querySelector("#bh-angular-momentum"),
      object: document.querySelector("#bh-object"),
      preset: document.querySelector("#bh-preset"),
      presetState: document.querySelector("[data-preset-state]"),
      radius: document.querySelector("#bh-radius"),
      energy: document.querySelector("#bh-energy"),
      lz: document.querySelector("#bh-lz"),
      direction: document.querySelector("#bh-direction"),
      massKg: document.querySelector("[data-mass-kg]"),
      impactParameter: document.querySelector("[data-impact-parameter]"),
      massLabel: document.querySelector("[data-mass-label]"),
      chargeLabel: document.querySelector("[data-charge-label]"),
      angularMomentumLabel: document.querySelector("[data-angular-momentum-label]"),
      status: document.querySelector("[data-simulation-status]"),
      spacetimeName: document.querySelector("[data-spacetime-name]"),
      warning: document.querySelector("[data-extremality-warning]"),
      properties: document.querySelector("[data-properties]"),
      metricLatex: document.querySelector("[data-metric-latex]"),
      canvas: document.querySelector("[data-geodesic-canvas]"),
      legend: document.querySelector("[data-plot-legend]"),
      checks: document.querySelector("[data-numerical-checks]"),
      initialMetric: document.querySelector("[data-initial-metric]"),
      inverseMetric: document.querySelector("[data-inverse-metric]"),
      initialVector: document.querySelector("[data-initial-vector]"),
      integrationParameters: document.querySelector("[data-integration-parameters]"),
      christoffel: document.querySelector("[data-christoffel]"),
      calculationPanel: document.querySelector("#calculation-details"),
      calculationLink: document.querySelector("a[href='#calculation-details']"),
      validationStatus: document.querySelector("[data-validation-status]"),
      validationResults: document.querySelector("[data-validation-results]")
    };
  }

  function renderLists() {
    const copy = content();
    document.querySelectorAll("[data-simulator-list]").forEach((list) => {
      const items = copy[list.dataset.simulatorList] || [];
      list.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
    });
  }

  function setInputValuesFromPhysical(physical) {
    currentPhysical = { ...physical };
    if (unitMode === "physical") {
      elements.mass.value = formatInput(physical.massSolar);
      elements.charge.value = formatInput(physical.chargeC);
      elements.angularMomentum.value = formatInput(physical.angularMomentum);
    } else {
      const geometry = P.physicalToGeometrized(physical);
      elements.mass.value = formatInput(geometry.massMeters / 1000);
      elements.charge.value = formatInput(geometry.chargeMeters / 1000);
      elements.angularMomentum.value = formatInput(geometry.angularMomentumMeters2 / 1e6);
    }
  }

  function formatInput(value) {
    if (!Number.isFinite(value)) return "0";
    return Math.abs(value) >= 1e8 || (Math.abs(value) > 0 && Math.abs(value) < 1e-5)
      ? value.toExponential(10)
      : String(Number(value.toPrecision(12)));
  }

  function readPhysicalInputs() {
    if (unitMode === "physical") {
      return {
        massSolar: numberValue(elements.mass),
        chargeC: numberValue(elements.charge),
        angularMomentum: numberValue(elements.angularMomentum)
      };
    }
    return P.geometrizedToPhysical({
      massKm: numberValue(elements.mass),
      chargeKm: numberValue(elements.charge),
      angularMomentumKm2: numberValue(elements.angularMomentum)
    });
  }

  function setUnitMode(nextMode) {
    const physical = readPhysicalInputs();
    unitMode = nextMode;
    document.querySelectorAll("[data-unit-mode]").forEach((button) => {
      const active = button.dataset.unitMode === unitMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    setInputValuesFromPhysical(physical);
    updateUnitLabels();
    updateGeometry({ preserveTrajectory: true, quiet: true });
  }

  function updateUnitLabels() {
    if (!elements) return;
    const copy = content();
    elements.massLabel.textContent = unitMode === "physical"
      ? copy.massLabelPhysical : copy.massLabelGeometrized;
    elements.chargeLabel.textContent = unitMode === "physical"
      ? copy.chargeLabelPhysical : copy.chargeLabelGeometrized;
    elements.angularMomentumLabel.textContent = unitMode === "physical"
      ? copy.angularMomentumLabelPhysical : copy.angularMomentumLabelGeometrized;
  }

  function selectedSpacetimeFromInputs() {
    const charge = numberValue(elements.charge);
    const angularMomentum = numberValue(elements.angularMomentum);
    return P.classifySpacetime(
      isFiniteNumber(charge) && charge !== 0,
      isFiniteNumber(angularMomentum) && angularMomentum !== 0
    );
  }

  function renderConfigurationState() {
    const copy = content();
    if (activePreset && PRESETS[activePreset]) {
      elements.preset.value = activePreset;
      elements.presetState.textContent = `${copy.activePreset}: ${copy.presets?.[activePreset] || activePreset}`;
      elements.presetState.dataset.configuration = "preset";
      return;
    }
    elements.preset.value = "custom";
    elements.presetState.textContent = copy.customConfiguration;
    elements.presetState.dataset.configuration = "custom";
  }

  function markConfigurationCustom() {
    if (!activePreset) return;
    activePreset = null;
    renderConfigurationState();
  }

  function applyPreset(presetName) {
    const preset = PRESETS[presetName];
    if (!preset) return;
    const physical = {
      massSolar: DEFAULT_MASS_SOLAR,
      chargeC: preset.qC,
      angularMomentum: P.angularMomentumForSpin(DEFAULT_MASS_SOLAR, preset.aStar)
    };
    setInputValuesFromPhysical(physical);
    elements.object.value = preset.object;
    elements.radius.value = formatInput(preset.radius);
    elements.energy.value = formatInput(preset.energy);
    elements.lz.value = formatInput(preset.lz);
    elements.direction.value = preset.direction;
    activePreset = presetName;
    renderConfigurationState();
    updateImpactParameter();
    updateGeometry({ preserveTrajectory: false, quiet: false });
  }

  function updateImpactParameter() {
    const energy = numberValue(elements.energy);
    const lz = numberValue(elements.lz);
    elements.impactParameter.textContent = energy !== 0 && isFiniteNumber(energy) && isFiniteNumber(lz)
      ? formatNumber(lz / energy) : "N/A";
  }

  function markTrajectoryStale() {
    lastSimulation = null;
    if (currentParams) {
      const properties = P.geometryProperties(currentParams, currentSpacetime);
      renderVisualization(null, currentParams, properties);
    }
    renderNumericalChecks(null);
    elements.status.textContent = content().initialConditionsChanged || "";
  }

  function updateGeometry({ preserveTrajectory = false, quiet = false } = {}) {
    try {
      const physical = readPhysicalInputs();
      const params = P.dimensionlessParameters(physical);
      const spacetime = selectedSpacetimeFromInputs();
      currentPhysical = physical;
      currentParams = params;
      currentSpacetime = spacetime;
      const properties = P.geometryProperties(params, spacetime);
      if (!preserveTrajectory) lastSimulation = null;
      elements.massKg.textContent = `${formatNumber(params.geometry.massKg)} kg`;
      renderProperties(params, physical, properties);
      renderMetric(params, properties.spacetime);
      renderVisualization(lastSimulation, params, properties);
      renderNumericalChecks(lastSimulation);
      if (!quiet) elements.status.textContent = content().geometryLive || "";
    } catch (error) {
      currentParams = null;
      elements.status.textContent = `${content().initialConditionError}: ${localizedError(error)}`;
    }
  }

  function spacetimeDisplayName(type) {
    return {
      schwarzschild: "Schwarzschild",
      reissnerNordstrom: "Reissner–Nordström",
      kerr: "Kerr",
      kerrNewman: "Kerr–Newman"
    }[type] || type;
  }

  function radialDisplay(value, massMeters) {
    if (value === null || !Number.isFinite(value)) return content().notAvailable;
    return `${formatNumber(value)} M (${formatNumber(value * massMeters / 1000)} km)`;
  }

  function renderProperties(params, physical, properties) {
    const copy = content();
    elements.spacetimeName.textContent = spacetimeDisplayName(properties.spacetime);
    elements.warning.hidden = properties.hasHorizon;
    const geometry = params.geometry;
    const rows = [
      [copy.massProperty, `${formatNumber(physical.massSolar)} M☉ = ${formatNumber(geometry.massKg)} kg`],
      [copy.chargeProperty, `${formatNumber(physical.chargeC)} C; Q/M = ${formatNumber(params.q)}`],
      [copy.angularMomentumProperty, `${formatNumber(physical.angularMomentum)} kg·m²/s`],
      [copy.spinLength, `${formatNumber(params.a)} M (${formatNumber(geometry.aMeters / 1000)} km)`],
      [copy.dimensionlessSpin, formatNumber(params.a)],
      [copy.outerHorizon, radialDisplay(properties.outer, geometry.massMeters)],
      [copy.innerHorizon, radialDisplay(properties.inner, geometry.massMeters)],
      [copy.staticLimit, radialDisplay(properties.outerStaticLimit, geometry.massMeters)],
      [copy.extremality, `${formatNumber(properties.extremality)} M²`],
      [copy.isco, localizedOrbitValue(properties.orbitInfo.isco)],
      [copy.photonOrbit, localizedOrbitValue(properties.orbitInfo.photon)]
    ];
    elements.properties.innerHTML = rows.map(([label, value]) =>
      `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  }

  function localizedOrbitValue(value) {
    const copy = content();
    if (value === "N/A") return copy.notAvailable;
    return value
      .replaceAll("prograde", copy.prograde)
      .replaceAll("retrograde", copy.retrograde);
  }

  function metricLatex(type) {
    if (type === "schwarzschild") {
      return String.raw`\[f(r)=1-\frac{2M}{r},\qquad ds^2=-f(r)\,dt^2+f(r)^{-1}dr^2+r^2\left(d\theta^2+\sin^2\theta\,d\phi^2\right).\]`;
    }
    if (type === "reissnerNordstrom") {
      return String.raw`\[f(r)=1-\frac{2M}{r}+\frac{Q^2}{r^2},\qquad ds^2=-f(r)\,dt^2+f(r)^{-1}dr^2+r^2\left(d\theta^2+\sin^2\theta\,d\phi^2\right).\]`;
    }
    if (type === "kerr") {
      return String.raw`\[\Sigma=r^2+a^2\cos^2\theta,\qquad\Delta=r^2-2Mr+a^2,\]
\[\begin{aligned}ds^2={}&-\left(1-\frac{2Mr}{\Sigma}\right)dt^2-\frac{4Mar\sin^2\theta}{\Sigma}\,dt\,d\phi+\frac{\Sigma}{\Delta}dr^2+\Sigma\,d\theta^2\\&+\left(r^2+a^2+\frac{2Mra^2\sin^2\theta}{\Sigma}\right)\sin^2\theta\,d\phi^2.\end{aligned}\]`;
    }
    return String.raw`\[\Sigma=r^2+a^2\cos^2\theta,\qquad\Delta=r^2-2Mr+a^2+Q^2,\]
\[\begin{aligned}ds^2={}&-\left(1-\frac{2Mr-Q^2}{\Sigma}\right)dt^2-\frac{2a(2Mr-Q^2)\sin^2\theta}{\Sigma}\,dt\,d\phi+\frac{\Sigma}{\Delta}dr^2+\Sigma\,d\theta^2\\&+\left(r^2+a^2+\frac{a^2(2Mr-Q^2)\sin^2\theta}{\Sigma}\right)\sin^2\theta\,d\phi^2.\end{aligned}\]`;
  }

  function renderMetric(params, type) {
    elements.metricLatex.textContent = metricLatex(type);
    if (window.MathJax?.typesetPromise) {
      if (window.MathJax.typesetClear) window.MathJax.typesetClear([elements.metricLatex]);
      window.MathJax.typesetPromise([elements.metricLatex]);
    }
  }

  function runSimulation(event) {
    if (event) event.preventDefault();
    try {
      const physical = readPhysicalInputs();
      const params = P.dimensionlessParameters(physical);
      const spacetime = selectedSpacetimeFromInputs();
      const properties = P.geometryProperties(params, spacetime);
      const radius = numberValue(elements.radius);
      if (properties.hasHorizon && radius <= properties.outer + P.NUMERICS.horizonMargin) {
        const error = new Error("r_0 must lie outside the outer horizon in Boyer-Lindquist coordinates.");
        error.code = "insideOuterHorizon";
        throw error;
      }
      const initialState = P.initialStateFromConstants(params, {
        radius,
        energy: numberValue(elements.energy),
        angularMomentum: numberValue(elements.lz),
        massive: elements.object.value === "massive",
        radialDirection: elements.direction.value
      });
      const maxLambda = activePreset
        ? PRESETS[activePreset].maxLambda
        : P.NUMERICS.maxLambda;
      const result = P.integrateGeodesic(params, initialState, { maxLambda });
      lastSimulation = { params, physical, properties, initialState, result };
      currentParams = params;
      currentPhysical = physical;
      currentSpacetime = spacetime;
      renderVisualization(lastSimulation, params, properties);
      renderNumericalChecks(lastSimulation);
      renderCalculationDetails(lastSimulation);
      elements.status.textContent = `${content().simulationReady} ${content().stopReasons[result.stopReason] || result.stopReason}`;
    } catch (error) {
      lastSimulation = null;
      renderNumericalChecks(null);
      elements.status.textContent = `${content().initialConditionError}: ${localizedError(error)}`;
    }
  }

  function drawCircle(context, centerX, centerY, radius, style) {
    if (!(radius > 0)) return;
    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    Object.assign(context, style);
    if (style.fillStyle) context.fill();
    if (style.strokeStyle) context.stroke();
    context.restore();
  }

  function renderVisualization(simulation, params, properties) {
    const canvas = elements.canvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const points = simulation?.result.points || [];
    const radii = points.map((state) => state[1]).filter((value) => Number.isFinite(value));
    const referenceRadius = Math.max(
      4,
      properties.outerStaticLimit || 0,
      properties.outer || 0,
      ...radii
    );
    const scale = Math.min(width, height) * 0.43 / referenceRadius;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#080b10";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(155, 183, 212, 0.12)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, centerY);
    context.lineTo(width, centerY);
    context.moveTo(centerX, 0);
    context.lineTo(centerX, height);
    context.stroke();

    if (properties.hasHorizon && properties.outerStaticLimit > properties.outer) {
      drawCircle(context, centerX, centerY, properties.outerStaticLimit * scale, {
        fillStyle: "rgba(212, 180, 131, 0.12)", strokeStyle: "rgba(212, 180, 131, 0.55)", lineWidth: 2
      });
    }
    if (properties.hasHorizon) {
      drawCircle(context, centerX, centerY, properties.outer * scale, {
        fillStyle: "rgba(8, 10, 14, 0.96)", strokeStyle: "#d4b483", lineWidth: 3
      });
      context.setLineDash([7, 7]);
      drawCircle(context, centerX, centerY, properties.inner * scale, {
        strokeStyle: "rgba(155, 183, 212, 0.7)", lineWidth: 2
      });
      context.setLineDash([]);
    } else {
      drawCircle(context, centerX, centerY, 5, { fillStyle: "#d4b483" });
    }

    if (points.length > 1) {
      context.strokeStyle = "#9bb7d4";
      context.lineWidth = 3;
      context.beginPath();
      points.forEach((state, index) => {
        const x = centerX + state[1] * Math.cos(state[3]) * scale;
        const y = centerY - state[1] * Math.sin(state[3]) * scale;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();

      const first = points[0];
      drawCircle(context, centerX + first[1] * Math.cos(first[3]) * scale,
        centerY - first[1] * Math.sin(first[3]) * scale, 6, { fillStyle: "#e8e3d8" });
      const last = points[points.length - 1];
      const previous = points[points.length - 2];
      const lastX = centerX + last[1] * Math.cos(last[3]) * scale;
      const lastY = centerY - last[1] * Math.sin(last[3]) * scale;
      const previousX = centerX + previous[1] * Math.cos(previous[3]) * scale;
      const previousY = centerY - previous[1] * Math.sin(previous[3]) * scale;
      const angle = Math.atan2(lastY - previousY, lastX - previousX);
      context.fillStyle = "#9bb7d4";
      context.beginPath();
      context.moveTo(lastX, lastY);
      context.lineTo(lastX - 13 * Math.cos(angle - 0.45), lastY - 13 * Math.sin(angle - 0.45));
      context.lineTo(lastX - 13 * Math.cos(angle + 0.45), lastY - 13 * Math.sin(angle + 0.45));
      context.closePath();
      context.fill();
    }
    renderLegend(properties);
  }

  function renderLegend(properties) {
    const copy = content();
    const items = [
      ["trajectory", copy.trajectory],
      ["initial", copy.initialPoint]
    ];
    if (properties.hasHorizon) {
      items.push(["outer-horizon", copy.outerEventHorizon]);
      if (properties.inner > 1e-6) items.push(["inner-horizon", copy.innerEventHorizon]);
      if (properties.outerStaticLimit > properties.outer) items.push(["ergoregion", copy.ergoregion]);
    }
    elements.legend.innerHTML = items.map(([className, label]) =>
      `<span><i class="legend-swatch ${className}"></i>${label}</span>`).join("");
  }

  function renderNumericalChecks(simulation) {
    const copy = content();
    const checks = simulation?.result.checks;
    const stop = simulation?.result.stopReason;
    const momentumValue = checks
      ? checks.angularMomentumIsZero
        ? `N/A (|ΔL_z| = ${formatNumber(checks.absoluteAngularMomentumChange)})`
        : formatNumber(checks.relativeAngularMomentumChange)
      : "—";
    const rows = [
      [copy.normalizationError, checks ? formatNumber(checks.normalizationError) : "—"],
      [copy.energyChange, checks ? formatNumber(checks.relativeEnergyChange) : "—"],
      [copy.momentumChange, momentumValue],
      [copy.thetaDrift, checks ? formatNumber(checks.thetaDrift) : "—"],
      [copy.stopReason, stop ? copy.stopReasons[stop] || stop : "—"]
    ];
    elements.checks.innerHTML = rows.map(([label, value]) =>
      `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  }

  function formatMatrix(matrix) {
    return matrix.map((row) => `[ ${row.map((value) => formatNumber(value, 8).padStart(13)).join("  ")} ]`).join("\n");
  }

  function renderCalculationDetails(simulation) {
    if (!simulation) return;
    const { params, initialState, result } = simulation;
    const g = P.metric(params, initialState[1], initialState[2]);
    const inverse = P.inverseMetric(g);
    const constants = P.conservedQuantities(params, initialState);
    const vector = initialState.slice(4);
    const copy = content();
    elements.initialMetric.textContent = formatMatrix(g);
    elements.inverseMetric.textContent = formatMatrix(inverse);
    elements.initialVector.textContent = [
      `v^μ = [${vector.map((value) => formatNumber(value, 10)).join(", ")}]`,
      `E = ${formatNumber(constants.energy, 10)}`,
      `L_z = ${formatNumber(constants.angularMomentum, 10)}`,
      `g_μν v^μ v^ν = ${formatNumber(constants.normalization, 12)}`
    ].join("\n");
    elements.integrationParameters.textContent = [
      `${copy.calculationCoordinates} = (t, r, θ, φ)`,
      `${copy.calculationState} = (t, r, θ, φ, v^t, v^r, v^θ, v^φ)`,
      `${copy.calculationIntegrator} = RK4`,
      `${copy.calculationStep} = ${result.settings.step}`,
      `${copy.calculationMaximumInterval} = ${result.settings.maxLambda}`,
      `${copy.calculationCompletedInterval} = ${formatNumber(result.lambda)}`,
      `${copy.calculationStoredPoints} = ${result.points.length}`
    ].join("\n");
    elements.christoffel.textContent = P.nonzeroChristoffelAt(
      params, initialState[1], initialState[2]
    ).map((entry) => `${entry.label} = ${formatNumber(entry.value, 10)}`).join("\n");
  }

  function formatValidationNumber(value) {
    if (!Number.isFinite(value)) return "N/A";
    if (value === 0) return "0";
    const magnitude = Math.abs(value);
    if (magnitude < 1e-4 || magnitude >= 1e5) return value.toExponential(3);
    return Number(value.toPrecision(9)).toString();
  }

  function validationCell(label, value, className = "") {
    return `<div class="validation-cell ${className}" role="cell"><span class="validation-cell-label">${label}</span>${value}</div>`;
  }

  function validationRow(name, reference, computed, error, passed) {
    const copy = content().validation;
    const status = passed ? copy.pass : copy.fail;
    return `<div class="validation-row" role="row">
      ${validationCell(copy.checkColumn, `<strong>${name}</strong>`, "validation-check")}
      ${validationCell(copy.referenceColumn, reference)}
      ${validationCell(copy.computedColumn, computed)}
      ${validationCell(copy.errorColumn, error)}
      ${validationCell(copy.statusColumn, `<span class="validation-badge ${passed ? "pass" : "fail"}">${status}</span>`)}
    </div>`;
  }

  function validationTable(rows) {
    const copy = content().validation;
    const header = `<div class="validation-row validation-table-header" role="row">
      <div role="columnheader">${copy.checkColumn}</div>
      <div role="columnheader">${copy.referenceColumn}</div>
      <div role="columnheader">${copy.computedColumn}</div>
      <div role="columnheader">${copy.errorColumn}</div>
      <div role="columnheader">${copy.statusColumn}</div>
    </div>`;
    return `<div class="validation-table" role="table">${header}${rows.join("")}</div>`;
  }

  function scientificValue(value, unit = "") {
    return `${formatValidationNumber(value)}${unit ? ` ${unit}` : ""}`;
  }

  function renderScientificValidation() {
    if (!elements?.validationStatus || !elements.validationResults) return;
    const copy = content().validation || {};
    if (validationError) {
      elements.validationStatus.className = "validation-status failed";
      elements.validationStatus.textContent = copy.unavailable || "Validation unavailable.";
      elements.validationResults.hidden = true;
      return;
    }
    if (!validationResult) {
      elements.validationStatus.className = "validation-status running";
      elements.validationStatus.textContent = content().validationRunning || "Running validation…";
      elements.validationResults.hidden = true;
      return;
    }

    const result = validationResult;
    elements.validationStatus.className = `validation-status ${result.passed ? "passed" : "failed"}`;
    elements.validationStatus.innerHTML = `<span class="validation-badge ${result.passed ? "pass" : "fail"}">${result.passed ? copy.pass : copy.fail}</span><span>${result.passed ? copy.overallPass : copy.overallFail}</span>`;

    const analyticalRows = result.analyticalCases.map((entry) => validationRow(
      copy.benchmarks[entry.id],
      scientificValue(entry.reference, "M"),
      scientificValue(entry.computed, "M"),
      `${scientificValue(entry.error)}; ${copy.tolerance} ≤ ${scientificValue(entry.tolerance)}`,
      entry.passed
    ));
    const familyRows = result.familyCases.map((entry) => validationRow(
      copy.benchmarks[entry.id],
      spacetimeDisplayName(entry.reference),
      spacetimeDisplayName(entry.computed),
      copy.exactMatch,
      entry.passed
    ));
    const tensorRows = result.tensorCases.map((entry) => validationRow(
      copy.benchmarks[entry.id],
      "0",
      scientificValue(entry.computed),
      `${scientificValue(entry.error)}; ${copy.tolerance} ≤ ${scientificValue(entry.tolerance)}`,
      entry.passed
    ));
    const geodesicGroups = result.geodesicCases.map((benchmark) => {
      const rows = benchmark.measurements.map((entry) => validationRow(
        copy.measurements[entry.id],
        "0",
        scientificValue(entry.computed),
        `${scientificValue(entry.error)}; ${copy.tolerance} ≤ ${scientificValue(entry.tolerance)}`,
        entry.passed
      ));
      const note = benchmark.id === "photonCircular" ? copy.photonNote : copy.massiveNote;
      const intervalState = benchmark.completed ? copy.completedInterval : copy.incompleteInterval;
      return `<article class="validation-geodesic">
        <div class="validation-geodesic-heading">
          <div><h4>${copy.benchmarks[benchmark.id]}</h4><p>${note}</p></div>
          <p class="validation-metadata">Δλ = ${formatValidationNumber(benchmark.maxLambda)} · h = ${formatValidationNumber(benchmark.step)} · ${intervalState}</p>
        </div>
        ${validationTable(rows)}
      </article>`;
    }).join("");

    elements.validationResults.innerHTML = `
      <section class="validation-group"><h3>${copy.analyticalTitle}</h3>${validationTable(analyticalRows)}</section>
      <section class="validation-group"><h3>${copy.familyTitle}</h3>${validationTable(familyRows)}</section>
      <section class="validation-group"><h3>${copy.tensorTitle}</h3><p>${copy.tensorPoint}</p>${validationTable(tensorRows)}</section>
      <section class="validation-group"><h3>${copy.geodesicTitle}</h3>${geodesicGroups}</section>`;
    elements.validationResults.hidden = false;
  }

  function scheduleScientificValidation() {
    if (!elements.validationResults || validationPromise) return;
    renderScientificValidation();
    validationPromise = new Promise((resolve) => {
      const run = () => {
        try {
          validationResult = P.runScientificValidation();
        } catch (error) {
          validationError = error;
        }
        renderScientificValidation();
        resolve(validationResult);
      };
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(run, { timeout: 800 });
      } else {
        window.setTimeout(run, 0);
      }
    });
  }

  function bindEvents() {
    document.querySelectorAll("[data-unit-mode]").forEach((button) => {
      button.addEventListener("click", () => setUnitMode(button.dataset.unitMode));
    });
    [elements.mass, elements.charge, elements.angularMomentum].forEach((input) => {
      input.addEventListener("input", () => {
        markConfigurationCustom();
        updateGeometry({ preserveTrajectory: false, quiet: false });
      });
    });
    elements.preset.addEventListener("change", () => applyPreset(elements.preset.value));
    elements.object.addEventListener("change", () => {
      markConfigurationCustom();
      updateImpactParameter();
      markTrajectoryStale();
    });
    [elements.energy, elements.lz].forEach((input) => input.addEventListener("input", () => {
      markConfigurationCustom();
      updateImpactParameter();
      markTrajectoryStale();
    }));
    elements.radius.addEventListener("input", () => {
      markConfigurationCustom();
      markTrajectoryStale();
    });
    elements.direction.addEventListener("change", () => {
      markConfigurationCustom();
      markTrajectoryStale();
    });
    elements.calculationLink?.addEventListener("click", () => {
      elements.calculationPanel.open = true;
    });
    elements.form.addEventListener("submit", runSimulation);
    window.addEventListener("resize", () => {
      if (currentParams) {
        renderVisualization(lastSimulation, currentParams,
          P.geometryProperties(currentParams, currentSpacetime));
      }
    });
  }

  function initialize() {
    if (!document.querySelector("[data-simulator-form]")) return;
    cacheElements();
    language = document.documentElement.lang || "it";
    renderLists();
    setInputValuesFromPhysical({
      massSolar: DEFAULT_MASS_SOLAR,
      chargeC: 0,
      angularMomentum: P.angularMomentumForSpin(DEFAULT_MASS_SOLAR, DEFAULT_SPIN)
    });
    elements.preset.value = "photonCapture";
    elements.object.value = "photon";
    elements.radius.value = "12";
    elements.energy.value = "1";
    elements.lz.value = "2.5";
    elements.direction.value = "ingoing";
    activePreset = "photonCapture";
    renderConfigurationState();
    updateImpactParameter();
    updateUnitLabels();
    bindEvents();
    initialized = true;
    updateGeometry({ preserveTrajectory: false, quiet: true });
    scheduleScientificValidation();
  }

  window.updateBlackHoleSimulatorLanguage = function (nextLanguage) {
    language = nextLanguage;
    renderLists();
    if (!initialized) return;
    renderScientificValidation();
    updateUnitLabels();
    renderConfigurationState();
    if (currentParams) {
      const properties = P.geometryProperties(currentParams, currentSpacetime);
      renderProperties(currentParams, currentPhysical, properties);
      renderMetric(currentParams, properties.spacetime);
      renderVisualization(lastSimulation, currentParams, properties);
      renderNumericalChecks(lastSimulation);
      if (lastSimulation) {
        renderCalculationDetails(lastSimulation);
        elements.status.textContent = `${content().simulationReady} ${content().stopReasons[lastSimulation.result.stopReason] || lastSimulation.result.stopReason}`;
      } else {
        elements.status.textContent = content().geometryLive || "";
      }
    }
  };

  document.addEventListener("DOMContentLoaded", initialize);
}());
