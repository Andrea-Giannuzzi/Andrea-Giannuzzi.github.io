# Andrea Giannuzzi — Academic Portfolio

Static bilingual academic website built with plain HTML, CSS, and JavaScript and published with GitHub Pages. It presents an academic profile, ongoing research work, scientific projects, notes, a web CV, and the browser-based Kerr–Newman Black Hole Simulator.

## Main pages

```text
index.html                  Academic overview and featured work
about.html                  Academic path, interests, skills, and coursework
research.html               Ongoing research work and research notes
black-hole-simulator.html   Equatorial-geodesic 2D simulator
black-hole-simulator-3d.html 3D geodesics with local launch angles and orbit controls
projects.html               Featured and earlier/learning projects
notes.html                  Subject-based scientific notes library
cv.html                     Concise web CV and downloadable PDF CV
contact.html                Contact details
```

Project detail pages live under `projects/`. Notes use a subject hierarchy under `notes/`, with each subject page rendering its available entries and PDF actions from shared content data.

## Content and JavaScript architecture

- `assets/js/content.js` contains bilingual page copy, project/research/note entries, shared document metadata, and the centralized `ACADEMIC_PROFILE` object.
- `assets/js/main.js` renders shared content, normalizes navigation, manages responsive navigation and reveal effects, and applies the saved IT/EN preference. English is the first-visit default; an existing `localStorage` preference is preserved.
- `assets/js/black-hole-physics.js` contains the readable numerical and relativistic-physics layers used by the simulator.
- `assets/js/black-hole-simulator.js` connects simulator controls, rendering, and language updates to the physics layer.
- `assets/css/styles.css` defines the shared theme, academic layouts, Notes/Projects cards, and simulator presentation.

## 3D initial conditions

The 3D view accepts initial radius and latitude, launch azimuth/elevation, and speed measured in the local ZAMO frame. Azimuth 0° points radially outward, 90° in the positive azimuthal direction, and 180° inward. Positive elevation points north of the local radial-azimuthal plane. Initial position azimuth is fixed to zero by axial symmetry.

Massive particles have `0 <= v/c < 1`; photons have `v/c = 1`. Energy, axial angular momentum and the Carter constant are derived. New photon launches use local energy normalized to 1; imported 2D states preserve their original affine normalization until edited. The 2D form remains equatorial. Opening 3D transfers the current 2D fields, including values not yet simulated. Matching completed runs start automatically; edited or unexecuted configurations wait for Run simulation. This transfer does not replace the last completed 2D run. Invalid launch conditions are reported before navigation.

Three additional 3D presets provide inclined photon motion and massive launches from the northern and southern hemispheres. The preview is rendered before configuration loading; its framing reserves space for the controls, which start collapsed on mobile.

The solver uses fixed-step RK4 in Boyer–Lindquist coordinates. Local 3D launches stop safely at the polar coordinate boundary or the existing horizon margin; these stops do not model collisions or continuation through the horizon. Diagnostics report normalization and conserved-quantity errors.

The disk's inner edge is the real numeric ISCO (`P.iscoRadius`; a spin-only Kerr fallback is used for the Kerr-Newman case, which has no closed-form ISCO here). Its rotation, gravitational+orbital redshift and Novikov-Thorne-shaped temperature/color are derived directly from the metric (`P.keplerianAngularVelocity`, `P.diskRedshiftFactor`, `P.diskTemperature`); relativistic Doppler beaming is computed live in a vertex/fragment shader from the camera position. Gravitational lensing of the starfield uses a 1-D deflection table (`P.computeLensingTable`) built from real backward-integrated photon geodesics (a new `escapedToLarge` stop reason), recomputed when physical parameters change. Both are deliberate approximations, not full per-pixel ray tracing: the lensing table does not capture Kerr's frame-dragging asymmetry or multiple imaging near the photon sphere, and the disk's absolute brightness/temperature scale is a display choice, not derived from an accretion rate. See the source comments in `assets/js/black-hole-physics.js` and `assets/js/black-hole-3d.js` for the exact formulas and their limits.

## Updating academic data

Edit factual profile values only in `window.ACADEMIC_PROFILE` near the top of `assets/js/content.js`. This object is the shared source for institution, degree, academic results, expected graduation, and structured coursework.

Course names are stored once per course with `it` and `en` labels. Completed courses use the `honours` flag to render either `30/30` or the localized honours form. The empty `current` array is ready for future use and is not rendered until it contains a course.

Localized headings and prose remain in the parallel `PORTFOLIO_CONTENT.it` and `PORTFOLIO_CONTENT.en` objects. Update both language blocks whenever adding user-visible copy.

## Adding research or projects

Add research entries to `researchItems` in both language blocks of `assets/js/content.js`. Keep the status, context, current contribution, methods, checks, reference work, and personal research-note PDF distinct so an ongoing contribution is not presented as a publication.

Add projects to `projectItems` in both language blocks. Set `tier: "featured"` and `featuredRank` only for projects that should appear in the Featured Projects group; entries without that tier appear under Earlier / Learning Projects. Project detail pages continue to use `data-project-detail`.

## Notes and documents

The Notes flow is:

```text
notes.html → subject page → note detail or shared PDF
```

Subjects and notes are defined in `noteSubjects` and `noteItems`. PDF paths should point to the existing subject-specific static directories. Shared documents used by more than one page are registered in `PORTFOLIO_DOCUMENTS`; unavailable files keep their explicit work-in-progress state instead of exposing broken links.

## CV and profile assets

- Profile image: `assets/images/profile.jpg`
- Downloadable CV: `assets/cv/cv.pdf`

Replacing either file at the same path requires no HTML change.

## Local preview

Requires Node.js/npm and Python 3. No dependency installation or build step is needed.

```bash
npm run dev
```

Open `http://127.0.0.1:8000` while the command remains running. The 3D simulator is at `http://127.0.0.1:8000/black-hole-simulator-3d.html`. Refresh the browser after editing files; this server does not provide automatic reload. Stop it with Ctrl+C.

Without npm, use `python3 -m http.server 8000 --bind 127.0.0.1`. If port 8000 is occupied, use `python3 -m http.server 8001 --bind 127.0.0.1` and open port 8001 instead.

Run the shared-physics and session-state checks with `npm test`.

Then open `http://127.0.0.1:8000` and verify navigation, both languages, project/note links, PDF actions, and the simulator on desktop and mobile widths.

## Deployment

GitHub Pages serves the repository root from the `main` branch.

## License

MIT License. See `LICENSE`.
