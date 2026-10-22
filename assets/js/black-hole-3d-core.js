/* The 3D view's logic that needs neither the DOM nor WebGL, kept apart from
 * black-hole-3d.js so the tests can load it in node: sampling a solved
 * trajectory for the scene, interpolating along it in lambda, the star-field
 * lensing shift and the status line. Scene axes follow three.js: y is the
 * spin axis (theta = 0), x-z the equatorial plane, 1 M = 1 scene unit.
 */
(function () {
  "use strict";

  function scenePosition(state) {
    const [, r, theta, phi] = state;
    return [r * Math.sin(theta) * Math.cos(phi), r * Math.cos(theta), r * Math.sin(theta) * Math.sin(phi)];
  }

  // The solver keeps one state every sampleEvery steps, so its last step is
  // generally not among result.points. For a stop at the horizon margin that
  // last state is the closest approach, the point the drawing exists to show
  // (a Schwarzschild plunge thinned to ~40 samples otherwise ended at r = 3.66
  // instead of 2.13), so it is appended with its own lambda unless it is not
  // finite or already the last sample. `stride` thins the samples further.
  // Non-finite states and states at or inside `minRadius` are skipped: one
  // NaN vertex would poison the bounding sphere of the whole Points object.
  function trajectorySamples(result, { stride = 1, minRadius = 0 } = {}) {
    const usable = (state) => state.every(Number.isFinite) && state[1] > minRadius;
    const states = [];
    const lambdas = [];
    for (let i = 0; i < result.points.length; i += stride) {
      if (!usable(result.points[i])) continue;
      states.push(result.points[i]);
      lambdas.push(result.sampleLambdas[i]);
    }
    const final = result.finalState;
    if (result.stopReason !== "nonFinite" && usable(final)
      && result.lambda > (lambdas.length ? lambdas[lambdas.length - 1] : -1) + 1e-9) {
      states.push(final);
      lambdas.push(result.lambda);
    }
    return { states, lambdas };
  }

  // The sample interval holding `lambda` and how far through it lambda lies,
  // for linear interpolation. The search starts at `start`, a cursor kept
  // between animation frames while lambda only grows; it stops at the last
  // interval, so a lambda past the end gives fraction 1.
  function sampleCursor(lambdas, lambda, start = 0) {
    let index = start;
    while (index < lambdas.length - 2 && lambdas[index + 1] <= lambda) index += 1;
    const nextIndex = Math.min(index + 1, lambdas.length - 1);
    const interval = lambdas[nextIndex] - lambdas[index];
    const fraction = interval > 0 ? Math.min(1, Math.max(0, (lambda - lambdas[index]) / interval)) : 0;
    return { index, nextIndex, fraction };
  }

  // Deflection (degrees) at a viewing angle from the black hole, linear in the
  // escaped samples of a P.computeLensingTable table: 0 up to the first one
  // (captured rays have no deflection), the last value beyond the last one.
  function angularDeflectionFor(table, angleDegrees) {
    const escaped = table?.samples.filter((sample) => sample.deflection !== null) ?? [];
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

  // Writes into `out` each star of `original` (flat x, y, z) moved, at its own
  // distance from the camera and in the plane through camera, target and star,
  // from its true angle ψ from the camera→target direction to ψ − deflection(ψ).
  // Stars beyond the table's last angle stay put. Using the true angle as if
  // it were the viewing angle is a first-order approximation of the harder
  // inversion, and the 1-D table cannot represent multiple imaging (both in
  // the comment above P.computeLensingTable).
  // `camera` and `target` need only x, y, z. The vector arithmetic repeats
  // three.js's own (normalizing multiplies by the reciprocal length), so the
  // result is the one the scene drew when this lived on THREE.Vector3.
  function lensStarField(original, out, camera, target, table) {
    if (!table) { out.set(original); return; }
    let bx = target.x - camera.x, by = target.y - camera.y, bz = target.z - camera.z;
    const inverseLength = 1 / (Math.sqrt(bx * bx + by * by + bz * bz) || 1);
    bx *= inverseLength; by *= inverseLength; bz *= inverseLength;
    const maxAngle = table.samples[table.samples.length - 1].angle;
    for (let i = 0; i < original.length; i += 3) {
      let sx = original[i] - camera.x, sy = original[i + 1] - camera.y, sz = original[i + 2] - camera.z;
      const starDistance = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      const inverseDistance = 1 / starDistance;
      sx *= inverseDistance; sy *= inverseDistance; sz *= inverseDistance;
      const cosAngle = Math.min(1, Math.max(-1, sx * bx + sy * by + sz * bz));
      const angleDeg = Math.acos(cosAngle) * 180 / Math.PI;
      const deflection = angleDeg > 0 && angleDeg <= maxAngle ? angularDeflectionFor(table, angleDeg) : 0;
      if (!deflection) {
        out[i] = original[i]; out[i + 1] = original[i + 1]; out[i + 2] = original[i + 2];
        continue;
      }
      const correctedRad = Math.max(0.01, angleDeg - deflection) * Math.PI / 180;
      let px = sx + bx * -cosAngle, py = sy + by * -cosAngle, pz = sz + bz * -cosAngle;
      const inversePerpLength = 1 / (Math.sqrt(px * px + py * py + pz * pz) || 1);
      px *= inversePerpLength; py *= inversePerpLength; pz *= inversePerpLength;
      const cos = Math.cos(correctedRad), sin = Math.sin(correctedRad);
      out[i] = camera.x + (bx * cos + px * sin) * starDistance;
      out[i + 1] = camera.y + (by * cos + py * sin) * starDistance;
      out[i + 2] = camera.z + (bz * cos + pz * sin) * starDistance;
    }
  }

  // The scene status line: the threeD message for `key`, then why the shown
  // run stopped while it plays or has played, then the over-extremal warning
  // when its spacetime has no horizon (not on a WebGL failure, which has no scene).
  const MESSAGES_WITH_STOP_REASON = ["running", "imported", "end", "motionReduced"];
  function statusMessage(copy, key, simulation) {
    let message = copy.threeD[key];
    if (simulation && MESSAGES_WITH_STOP_REASON.includes(key)) message += ` ${copy.stopReasons[simulation.result.stopReason]}`;
    if (simulation && !simulation.properties.hasHorizon && key !== "webglError") message += ` ${copy.overExtremalWarning}`;
    return message;
  }

  window.BlackHole3DCore = Object.freeze({
    scenePosition, trajectorySamples, sampleCursor, angularDeflectionFor, lensStarField, statusMessage
  });
}());
