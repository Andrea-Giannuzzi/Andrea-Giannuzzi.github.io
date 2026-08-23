# Andrea Giannuzzi — Academic Portfolio

Static bilingual academic website built with plain HTML, CSS, and JavaScript and published with GitHub Pages. It presents an academic profile, ongoing research work, scientific projects, notes, a web CV, and the browser-based Kerr–Newman Black Hole Simulator.

## Main pages

```text
index.html                  Academic overview and featured work
about.html                  Academic path, interests, skills, and coursework
research.html               Ongoing research work and research notes
black-hole-simulator.html   Interactive equatorial-geodesic Web Demo
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

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` and verify navigation, both languages, project/note links, PDF actions, and the simulator on desktop and mobile widths.

## Deployment

GitHub Pages serves the repository root from the `main` branch.

## License

MIT License. See `LICENSE`.
