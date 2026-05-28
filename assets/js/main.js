const DEFAULT_LANGUAGE = "it";
const SUPPORTED_LANGUAGES = ["it", "en"];

function getContent(language) {
  return window.PORTFOLIO_CONTENT[language] || window.PORTFOLIO_CONTENT[DEFAULT_LANGUAGE];
}

function getNestedValue(object, path) {
  return path.split(".").reduce((value, key) => (value ? value[key] : undefined), object);
}

function setTextContent(language) {
  const content = getContent(language);
  document.documentElement.lang = language;

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = getNestedValue(content, element.dataset.i18n);
    if (typeof value === "string") element.textContent = value;
  });

  document.querySelectorAll("[data-i18n-content]").forEach((element) => {
    const value = getNestedValue(content, element.dataset.i18nContent);
    if (typeof value === "string") element.setAttribute("content", value);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const value = getNestedValue(content, element.dataset.i18nAriaLabel);
    if (typeof value === "string") element.setAttribute("aria-label", value);
  });

  const titleElement = document.querySelector("title[data-i18n]");
  if (titleElement) {
    const title = getNestedValue(content, titleElement.dataset.i18n);
    if (typeof title === "string") document.title = title;
  }
}

function renderLists(language) {
  const content = getContent(language);
  document.querySelectorAll("[data-list]").forEach((container) => {
    const items = content.lists?.[container.dataset.list] || [];
    const tagName = container.tagName.toLowerCase();
    const itemTag = tagName === "ul" || tagName === "ol" ? "li" : "span";
    container.innerHTML = items.map((item) => `<${itemTag}>${item}</${itemTag}>`).join("");
  });
}

function renderSkills(language) {
  const content = getContent(language);
  document.querySelectorAll("[data-skills]").forEach((container) => {
    const groups = content.skills || {};
    container.innerHTML = Object.entries(groups)
      .map(([group, items]) => `
        <section class="skill-group">
          <h3>${group}</h3>
          <ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>
        </section>
      `)
      .join("");
  });
}

function renderProjects(language) {
  const content = getContent(language);
  const container = document.querySelector("[data-projects]");
  if (!container) return;

  container.innerHTML = content.projectItems.map((project) => `
    <article class="project-card reveal">
      <div class="project-preview" aria-hidden="true">${project.preview}</div>
      <div class="project-body">
        <p class="status">${project.status}</p>
        <h2>${project.title}</h2>
        <p class="project-short">${project.short}</p>
        <p>${project.detail}</p>
        <div class="tag-list small">${project.tech.map((item) => `<span>${item}</span>`).join("")}</div>
        <p class="repo-note">${project.repoNote}</p>
        <a class="text-link" href="${project.url}">GitHub</a>
      </div>
    </article>
  `).join("");
}

function getBasePath() {
  return window.PORTFOLIO_BASE_PATH || "";
}

function renderNoteSubjects(language) {
  const content = getContent(language);
  const container = document.querySelector("[data-note-subjects]");
  if (!container) return;

  const notesBySubject = new Map();
  (content.noteItems || []).forEach((note) => {
    notesBySubject.set(note.subjectId, (notesBySubject.get(note.subjectId) || 0) + 1);
  });

  container.innerHTML = (content.noteSubjects || []).map((subject) => `
    <article class="subject-card reveal">
      <p class="status">${notesBySubject.get(subject.id) || 0} ${content.notes.noteCountLabel}</p>
      <h2>${subject.title}</h2>
      <p>${subject.description}</p>
    </article>
  `).join("");
}

function renderNoteLibrary(language) {
  const content = getContent(language);
  const container = document.querySelector("[data-note-library]");
  if (!container) return;

  const notes = content.noteItems || [];
  container.innerHTML = (content.noteSubjects || []).map((subject) => {
    const subjectNotes = notes.filter((note) => note.subjectId === subject.id);
    const noteCards = subjectNotes.length
      ? subjectNotes.map((note) => `
          <article class="note-card reveal">
            <p class="status">${note.status}</p>
            <h3><a href="${getBasePath()}${note.url}">${note.title}</a></h3>
            <p>${note.description}</p>
            <dl class="note-meta">
              <div><dt>${content.notes.categoryLabel}</dt><dd>${note.subject}</dd></div>
              <div><dt>${content.notes.dateLabel}</dt><dd>${note.date}</dd></div>
            </dl>
            <a class="text-link" href="${getBasePath()}${note.url}">${content.notes.openNote}</a>
          </article>
        `).join("")
      : `<p class="muted">${content.notes.emptySubject}</p>`;

    return `
      <section class="note-subject reveal" id="${subject.id}">
        <div class="note-subject-heading">
          <h2>${subject.title}</h2>
          <p>${subject.description}</p>
        </div>
        <div class="note-card-grid">${noteCards}</div>
      </section>
    `;
  }).join("");
}

function renderNoteDetail(language) {
  const content = getContent(language);
  const container = document.querySelector("[data-note-detail]");
  if (!container) return;

  const note = (content.noteItems || []).find((item) => item.id === container.dataset.noteDetail);
  if (!note) {
    container.innerHTML = `<p class="muted">${content.notes.emptySubject}</p>`;
    return;
  }

  const pdfMarkup = note.pdfAvailable
    ? `<a class="button primary" href="${getBasePath()}${note.pdf}" download>${content.notes.downloadPdf}</a>`
    : `<span class="button disabled" aria-disabled="true">${content.notes.pdfComingSoon}</span>`;

  container.innerHTML = `
    <p class="eyebrow">${content.notes.eyebrow}</p>
    <h1>${note.title}</h1>
    <dl class="note-detail-meta">
      <div><dt>${content.notes.categoryLabel}</dt><dd>${note.subject}</dd></div>
      <div><dt>${content.notes.dateLabel}</dt><dd>${note.date}</dd></div>
      <div><dt>${content.notes.statusLabel}</dt><dd>${note.status}</dd></div>
    </dl>

    <section>
      <h2>${content.notes.readmeTitle}</h2>
      <p>${note.readme}</p>
      <ul class="plain-list">
        <li><strong>${content.notes.abstractTitle}:</strong> ${note.abstract}</li>
        <li><strong>${content.notes.topicsLabel}:</strong> ${note.topics.join(", ")}</li>
        <li><strong>${content.notes.prerequisitesLabel}:</strong> ${note.prerequisites}</li>
        <li><strong>${content.notes.referencesLabel}:</strong> ${note.references}</li>
        <li><strong>${content.notes.documentStatusLabel}:</strong> ${note.documentStatus}</li>
      </ul>
    </section>

    <section class="download-panel">
      <h2>${content.notes.downloadTitle}</h2>
      <p>${note.documentStatus}</p>
      ${pdfMarkup}
    </section>

    <a class="text-link" href="${getBasePath()}notes.html">${content.notes.backToNotes}</a>
  `;
}

function setLanguage(language) {
  const nextLanguage = SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
  localStorage.setItem("portfolio-language", nextLanguage);

  document.querySelectorAll("[data-lang]").forEach((button) => {
    const isActive = button.dataset.lang === nextLanguage;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  setTextContent(nextLanguage);
  renderLists(nextLanguage);
  renderSkills(nextLanguage);
  renderProjects(nextLanguage);
  renderNoteSubjects(nextLanguage);
  renderNoteLibrary(nextLanguage);
  renderNoteDetail(nextLanguage);

  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise();
  }
}

function markActiveNavigation() {
  const page = document.body.dataset.page;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === page) link.setAttribute("aria-current", "page");
  });
}

function setupNavigationToggle() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    nav.classList.toggle("open", !expanded);
  });
}

function setupRevealAnimations() {
  const elements = document.querySelectorAll(".reveal");
  if (!('IntersectionObserver' in window)) {
    elements.forEach((element) => element.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  elements.forEach((element) => observer.observe(element));
}

function setupProfileImage() {
  const image = document.querySelector("[data-profile-image]");
  const placeholder = document.querySelector("[data-profile-placeholder]");
  if (!image || !placeholder) return;

  image.addEventListener("load", () => {
    image.hidden = false;
    placeholder.hidden = true;
  });

  image.addEventListener("error", () => {
    image.hidden = true;
    placeholder.hidden = false;
  });

  if (image.complete && image.naturalWidth > 0) {
    image.hidden = false;
    placeholder.hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const savedLanguage = localStorage.getItem("portfolio-language") || DEFAULT_LANGUAGE;
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.lang));
  });

  markActiveNavigation();
  setupNavigationToggle();
  setupRevealAnimations();
  setupProfileImage();
  setLanguage(savedLanguage);
});
