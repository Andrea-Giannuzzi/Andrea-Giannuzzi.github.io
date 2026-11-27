# Andrea Giannuzzi — Academic Portfolio

Source code of [andrea-giannuzzi.github.io](https://andrea-giannuzzi.github.io/), my bilingual (Italian/English) academic website: profile, ongoing research, projects, study notes, CV and an interactive Kerr–Newman black hole simulator. It is plain HTML, CSS and JavaScript with no build step, served by GitHub Pages from the `main` branch.

## Pages

```text
index.html                    Academic overview and featured work
research.html                 Ongoing research work and research notes
black-hole-simulator.html     Kerr–Newman simulator, equatorial geodesics (2D)
black-hole-simulator-3d.html  Kerr–Newman simulator, 3D geodesics
projects.html                 Featured and earlier projects
notes.html                    Study notes by subject
cv.html                       Web CV and downloadable PDF
contact.html                  Contact details
```

Project pages live in `projects/`, notes and their PDFs in `notes/`, one article in `articles/`.

## Kerr–Newman black hole simulator

The simulator integrates geodesics of photons and neutral massive test particles around a black hole of mass M, charge Q and angular momentum J, entirely in the browser. Inputs can be given in physical units or in geometrized units (G = c = 4πε₀ = 1).

**2D view.** Equatorial orbits with presets for circular orbits, the ISCO, the photon sphere, capture, scattering and infall. The page also draws the black hole shadow α(β) for a chosen inclination, runs a validation suite against closed-form results and conserved quantities, estimates the convergence of the computed trajectory, and compares the solver with published geodesic codes.

**3D view.** Built with three.js. A particle can be launched from any latitude, with direction and speed measured by a local zero-angular-momentum observer (ZAMO): azimuth 0° points radially outward, 90° along the rotation and 180° inward; positive elevation points north. Massive particles take 0 ≤ v/c < 1, photons v/c = 1; energy, axial angular momentum and the Carter constant follow from the launch. The scene shows the horizon, the ergosphere, the photon rings and an accretion disk starting at the ISCO, with a Novikov–Thorne-shaped temperature profile, gravitational and orbital redshift and Doppler beaming. The star field is lensed with a deflection table traced from backward photon geodesics: each star is drawn at its primary and secondary image, and the table is retraced in a Web Worker when the camera distance changes.

**Numerics.** Fixed-step classical RK4 in Boyer–Lindquist coordinates. Integration stops at a small safety margin outside the horizon and at the polar axis, where these coordinates become singular; it does not continue through the horizon. The diagnostics report the normalization error and the drift of energy, angular momentum and Carter constant.

**Limits.** The 3D view is not full per-pixel ray tracing. The lensing table ignores the left–right asymmetry caused by frame dragging in a rotating hole, images of higher order near the photon sphere are not drawn, and the absolute brightness and temperature scale of the disk is a display choice, not derived from an accretion rate. The source comments give the exact formulas and their range of validity.

## Code

```text
assets/js/content.js                 Bilingual text and the data for profile, research, projects and notes
assets/js/main.js                    Shared rendering, navigation and IT/EN language switch
assets/js/black-hole-physics.js      Metric, geodesic equations, RK4, ISCO and photon orbits, shadow, lensing, validation
assets/js/black-hole-simulation.js   Configuration and runs shared by the 2D and 3D views
assets/js/black-hole-simulator.js    2D page
assets/js/black-hole-3d.js           3D page (three.js scene and controls)
assets/js/black-hole-3d-core.js      3D logic independent of the DOM and WebGL
assets/js/black-hole-lensing-worker.js  Background retracing of the lensing table
assets/css/                          Styles
assets/vendor/three/                 three.js
tests/                               Tests for the physics and the simulator logic
```

All page text is in `assets/js/content.js`, in two parallel blocks (`it` and `en`); the profile data (institution, degree, courses) is in the `ACADEMIC_PROFILE` object at the top of the same file.

## Running locally

Requires Python 3; Node.js is needed only for the tests and the `npm` shortcuts.

```bash
python3 -m http.server 8000 --bind 127.0.0.1     # with Node.js: npm run dev
```

Then open `http://127.0.0.1:8000`. To use another port, change `8000` (or run `npm run dev -- 8001`).

```bash
npm test
```

runs the tests in `tests/` with Node's built-in test runner.

## License

MIT License. See `LICENSE`.
