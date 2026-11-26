/* Traces lensing tables (P.computeLensingTable, about a second of rays) off
 * the main thread for the 3D view, when the camera has moved away from the
 * distance the current table was traced at (see refreshLensingTable in
 * black-hole-3d.js). A table that cannot be built comes back as null, and
 * the view then draws the stars at their true positions.
 */
self.window = self;
importScripts("black-hole-physics.js");

self.onmessage = ({ data: { id, params, cameraRadius } }) => {
  let table = null;
  try {
    table = self.KerrNewmanPhysics.computeLensingTable(params, { cameraRadius });
  } catch (_) {
    table = null;
  }
  self.postMessage({ id, table });
};
