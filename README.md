# Andrea Giannuzzi - Academic Portfolio

Static, bilingual academic portfolio for GitHub Pages.

## Purpose

This repository hosts the personal academic website of Andrea Giannuzzi, Bachelor student in Physics. The site is designed as a minimal portfolio for master's applications, project presentation, scientific notes, articles, CV, and contact information.

## Structure

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
├── .gitignore
├── assets/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── main.js
│   │   └── content.js
│   ├── images/
│   │   └── README.md
│   └── cv/
│       └── README.md
└── articles/
    └── fourier-series.html
```

## Editing Text and Languages

Most bilingual text is stored in:

```text
assets/js/content.js
```

Edit the `it` and `en` objects in parallel. The language selector `IT | EN` updates the current page dynamically through `assets/js/main.js`.

## Replacing the Profile Photo

Add your image here:

```text
assets/images/profile.jpg
```

The current layout uses an elegant placeholder, so the site does not break while the image is missing.

## Adding the CV PDF

Add your PDF here:

```text
assets/cv/cv.pdf
```

Then edit `cv.html`: replace the disabled `<span>` with an active link to `assets/cv/cv.pdf`.

## Adding a Project

Open `assets/js/content.js` and add a new object inside `projectItems` for both languages. Include:

- `title`
- `short`
- `detail`
- `tech`
- `status`
- `url`
- `repoNote`
- `preview`

## Adding an Article

1. Create a new file inside `articles/`, for example `articles/new-topic.html`.
2. Copy the structure of `articles/fourier-series.html`.
3. Add bilingual strings to `assets/js/content.js`.
4. Add a preview card in `blog.html`.

## Local Preview

From the repository root:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

## GitHub Pages Deployment

The site is intended to be published from:

```text
branch: website
folder: /
```

Check GitHub repository settings:

```text
Settings -> Pages -> Build and deployment -> Deploy from a branch -> website / root
```

## Working on the Website Branch

```bash
git switch website
git status
git add .
git commit -m "Describe the website change"
git push
```

## Merging into the Main Branch

If a main branch exists and you want to merge manually:

```bash
git fetch origin
git switch main
git pull origin main
git merge website
git push origin main
```

Alternatively, open a pull request on GitHub from `website` into the default branch.

## License

MIT License. See `LICENSE`.
