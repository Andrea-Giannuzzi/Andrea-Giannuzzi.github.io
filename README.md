# Andrea Giannuzzi - Academic Portfolio

Static, bilingual academic portfolio for GitHub Pages, built with plain HTML, CSS, and JavaScript.

## Purpose

This repository hosts the personal academic website of Andrea Giannuzzi, Bachelor student in Physics. The site is designed as a minimal academic portfolio for master's applications, project presentation, scientific notes, CV, and contact information.

## Current Structure

```text
/
├── index.html
├── about.html
├── projects.html
├── notes.html
├── blog.html
├── cv.html
├── contact.html
├── README.md
├── LICENSE
├── assets/
│   ├── css/styles.css
│   ├── js/content.js
│   ├── js/main.js
│   ├── images/profile.jpg
│   └── cv/cv.pdf
├── articles/
│   └── fourier-series.html
└── notes/
    ├── mathematical-physics/
    ├── analytical-mechanics/
    ├── general-relativity/
    ├── cosmology/
    ├── mathematical-methods/
    └── computational-physics/
```

## Notes Refactor

The old `Articles` section has been replaced by the new `Notes` library. The public entry point is now:

```text
notes.html
```

`blog.html` and `articles/fourier-series.html` are kept only as lightweight redirects so old links do not break.

## Editing Text and Languages

Most bilingual content is stored in:

```text
assets/js/content.js
```

Edit the `it` and `en` objects in parallel. The language selector `IT | EN` updates the current page dynamically through `assets/js/main.js`.

## Adding a New Note

1. Choose or create a subject folder under `notes/`, using lowercase names without spaces.
2. Create a new note page, for example:

```text
notes/general-relativity/new-note.html
```

3. Copy the structure of an existing note page and change only `data-note-detail`.
4. Add the note object to `noteItems` in both language blocks of `assets/js/content.js`.
5. If the subject is new, add it to `noteSubjects` in both language blocks.
6. Put the PDF in the matching `pdf/` folder, for example:

```text
notes/general-relativity/pdf/new-note.pdf
```

7. In `assets/js/content.js`, set:

```js
pdf: "notes/general-relativity/pdf/new-note.pdf",
pdfAvailable: true
```

If the PDF is not ready, keep `pdfAvailable: false`; the page will show `PDF coming soon` instead of a broken link.

## Adding a New Subject

1. Create a folder under `notes/`, for example:

```text
notes/quantum-mechanics/
notes/quantum-mechanics/pdf/
```

2. Add a `README.md` in the subject folder and in `pdf/`.
3. Add the subject to `noteSubjects` in `assets/js/content.js`.
4. Add one or more notes to `noteItems`.

## Replacing the Profile Photo

Add your image here:

```text
assets/images/profile.jpg
```

## Adding the CV PDF

Add or replace:

```text
assets/cv/cv.pdf
```

The CV page already links to this path.

## Local Preview

From the repository root:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

## Checking Links

For this static site, check links manually after changes:

1. Open `http://localhost:8000`.
2. Visit Home, About, Projects, Notes, CV, and Contact.
3. Open every note card from `notes.html`.
4. Confirm that PDF buttons show `PDF coming soon` unless a real PDF exists.
5. Test both `IT` and `EN`.

## GitHub Pages Deployment

The site is published from:

```text
branch: main
folder: /
```

For larger changes, work on a feature branch such as:

```bash
git switch -c notes-refactor
git status
git add .
git commit -m "Refactor articles section into notes library"
git push -u origin notes-refactor
```

Then open a pull request into `main`.

## License

MIT License. See `LICENSE`.
