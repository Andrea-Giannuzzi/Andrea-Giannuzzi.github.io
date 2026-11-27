/* The 3D view's logic that needs neither the DOM nor WebGL, kept apart from
 * black-hole-3d.js so the tests can load it in node: sampling a solved
 * trajectory for the scene, interpolating along it in lambda, the lensed
 * images of the star field and the status line. Scene axes follow three.js: y is the
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

  const DEGREE = Math.PI / 180;

  // The escaped rays of a P.computeLensingTable table as a map from the
  // viewing angle alpha (degrees from the hole) to the true direction of the
  // star seen there, psi = alpha + deflection. psi grows with alpha: below
  // -160 at the first escaped sample, next to the shadow edge, where the ray
  // has wound around the hole; 0 at the Einstein ring; about 180 straight
  // away from the hole. A star at true angle psi has its primary image where
  // the map reaches psi and its secondary image, across the hole, where it
  // reaches -psi. Inverting the table needs psi to grow with alpha and to
  // start at or below 0, so that every star, at psi 0 to 180, has its
  // primary image in the map. A hole with a horizon gives both (the first
  // psi is -3.6 even at 20000 M); without one, the map is null and the stars
  // keep their true positions, rather than fold onto a ring: the escape
  // directions wind back and forth (over-extremal Kerr-Newman, a 0.8,
  // q 0.7), or every inward ray ends at the singularity and the first escaped
  // one leaves at psi 44 (Kerr a 1.1, camera 4). null without two escaped samples.
  function lensingImageMap(table) {
    const escaped = table?.samples.filter((sample) => sample.deflection !== null) ?? [];
    if (escaped.length < 2) return null;
    const alphas = escaped.map((sample) => sample.angle);
    const psis = escaped.map((sample) => sample.angle + sample.deflection);
    if (!(psis[0] <= 0) || !psis.every((psi, i) => i === 0 || psi > psis[i - 1])) return null;
    return { alphas, psis };
  }

  // The image of true angle psi, written into `image`: its viewing angle,
  // linear in psi between samples, and its brightness. Past the last sample
  // the last deflection holds; before the first, the image lies closer to the
  // shadow edge than the table resolves: null. A secondary image (psi < 0)
  // has brightness min(1, magnification), the magnification
  // (sin alpha / |sin psi|) dalpha/dpsi being the ratio of the image's solid
  // angle to the star's: it falls below 0.01 within a few degrees of the
  // shadow edge, and rises again only for stars within a few degrees of
  // straight behind the camera (psi near -180), whose secondary images
  // crowd into a ring there. It is evaluated at this psi, with dalpha/dpsi the slope of
  // the interval, because 1/|sin psi| diverges at psi = 0 and -180: taken at
  // the samples and interpolated, a sample next to -180 made every image of
  // its interval bright, up to 8 times too bright at camera 6, and the band
  // came and went as the camera moved and the table was retraced. Primary
  // images keep full brightness: their magnification is at least 0.97 at
  // the usual camera distances of 40-80 M (0.8 at 10 M, for stars behind the
  // camera).
  function lensedImage(map, psi, image = {}) {
    const { alphas, psis } = map;
    const last = psis.length - 1;
    if (psi < psis[0]) return null;
    let slope = 1;
    if (psi >= psis[last]) {
      image.angle = alphas[last] + psi - psis[last];
    } else {
      let lo = 0, hi = last;
      while (hi - lo > 1) {
        const middle = (lo + hi) >> 1;
        if (psis[middle] <= psi) lo = middle; else hi = middle;
      }
      slope = (alphas[hi] - alphas[lo]) / (psis[hi] - psis[lo]);
      image.angle = alphas[lo] + (psi - psis[lo]) * slope;
    }
    image.brightness = 1;
    if (psi < 0) {
      const magnification = Math.sin(image.angle * DEGREE) / Math.abs(Math.sin(psi * DEGREE)) * slope;
      if (Number.isFinite(magnification)) image.brightness = Math.min(1, Math.abs(magnification));
    }
    return image;
  }

  // Writes into `out` the primary image of each star of `original` (flat x,
  // y, z) and, given `secondary` ({ positions, colors, baseColors }), the
  // secondary image there, its color the star's dimmed to the image's
  // brightness, or black where the table does not resolve it. Each image
  // keeps the star's distance from the camera and lies in the plane through
  // camera, hole and star, at the viewing angle lensedImage gives for the
  // star's true angle psi from the camera-to-hole direction: on the star's
  // side for psi, across the hole for -psi. No star then shows inside the
  // shadow, and the ring between the shadow edge and the Einstein ring holds
  // the secondary images. A star exactly behind the hole goes to one point
  // of its Einstein ring. The stars are taken at infinity, as the table's
  // escaping rays; higher-order images, within a fraction of a degree of the
  // shadow edge, are not drawn, and the one-sided table is applied all
  // around the hole (see P.computeLensingTable). Without a table the stars
  // keep their true positions and the secondary images are black.
  // The map is built once per call and one image object reused, not one per
  // star: the scene relenses its 4000 stars every frame. `camera` and `hole`
  // need only x, y, z.
  function lensStarField(original, out, camera, hole, table, secondary = null) {
    const map = lensingImageMap(table);
    if (!map) {
      out.set(original);
      if (secondary) { secondary.positions.set(original); secondary.colors.fill(0); }
      return;
    }
    let bx = hole.x - camera.x, by = hole.y - camera.y, bz = hole.z - camera.z;
    const inverseLength = 1 / (Math.sqrt(bx * bx + by * by + bz * bz) || 1);
    bx *= inverseLength; by *= inverseLength; bz *= inverseLength;
    const scratch = {};
    // Any direction across the camera-to-hole axis, for a star on that axis.
    const [ax, ay, az] = Math.abs(by) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const place = (target, i, angle, side, x, y, z, distance) => {
      const cos = Math.cos(angle * DEGREE), sin = side * Math.sin(angle * DEGREE);
      target[i] = camera.x + (bx * cos + x * sin) * distance;
      target[i + 1] = camera.y + (by * cos + y * sin) * distance;
      target[i + 2] = camera.z + (bz * cos + z * sin) * distance;
    };
    for (let i = 0; i < original.length; i += 3) {
      const sx = original[i] - camera.x, sy = original[i + 1] - camera.y, sz = original[i + 2] - camera.z;
      const distance = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      const cosAngle = Math.min(1, Math.max(-1, (sx * bx + sy * by + sz * bz) / distance));
      const psi = Math.acos(cosAngle) / DEGREE;
      let px = sx / distance - bx * cosAngle, py = sy / distance - by * cosAngle, pz = sz / distance - bz * cosAngle;
      let across = Math.sqrt(px * px + py * py + pz * pz);
      if (across < 1e-9) {
        px = ay * bz - az * by; py = az * bx - ax * bz; pz = ax * by - ay * bx;
        across = Math.sqrt(px * px + py * py + pz * pz);
      }
      px /= across; py /= across; pz /= across;
      place(out, i, lensedImage(map, psi, scratch).angle, 1, px, py, pz, distance);
      if (!secondary) continue;
      const image = lensedImage(map, -psi, scratch);
      const shade = image ? image.brightness : 0;
      if (image) place(secondary.positions, i, image.angle, -1, px, py, pz, distance);
      else { secondary.positions[i] = out[i]; secondary.positions[i + 1] = out[i + 1]; secondary.positions[i + 2] = out[i + 2]; }
      for (let c = 0; c < 3; c += 1) secondary.colors[i + c] = secondary.baseColors[i + c] * shade;
    }
  }

  // The camera radius to trace a lensing table at: the camera's distance from
  // the hole, but at least 4 M, as the view has always clamped it. null while
  // the table traced at `tracedRadius` is within 5 % of that, so the view
  // does not retrace (about a second in a worker) for every small zoom step.
  function lensingTraceRadius(distance, tracedRadius = null) {
    const radius = Math.max(distance, 4);
    return tracedRadius !== null && Math.abs(radius - tracedRadius) <= 0.05 * tracedRadius ? null : radius;
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
    scenePosition, trajectorySamples, sampleCursor, lensingImageMap, lensedImage, lensStarField, lensingTraceRadius, statusMessage
  });
}());
