const DEFAULT_LANGUAGE = "en";
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
    const groups = Object.entries(content.skills || {})
      .filter(([group]) => container.dataset.skills !== "technical" || group !== "Languages");
    container.innerHTML = groups
      .map(([group, items]) => `
        <section class="skill-group">
          <h3>${group}</h3>
          <ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>
        </section>
      `)
      .join("");
  });
}

function projectCardMarkup(project, content) {
  const repositoryAction = project.repositoryAction
    ? project.githubUrl
      ? `<a class="text-link" href="${project.githubUrl}">${content.projects.repositoryCardLink}</a>`
      : `<span class="text-link unavailable" aria-disabled="true">${content.projects.repositoryUnavailable}</span>`
    : "";
  return `
    <article class="project-card reveal visible">
      <div class="project-preview" aria-hidden="true">${project.preview}</div>
      <div class="project-body">
        <p class="status">${project.status}</p>
        <h2><a href="${getBasePath()}${project.url}">${project.title}</a></h2>
        <p class="project-short">${project.short}</p>
        <p>${project.detail}</p>
        <div class="tag-list small">${project.tech.map((item) => `<span>${item}</span>`).join("")}</div>
        <div class="project-actions">
          <a class="text-link" href="${getBasePath()}${project.url}">${content.projects.openProject}</a>
          ${repositoryAction}
        </div>
      </div>
    </article>
  `;
}

function renderProjects(language) {
  const content = getContent(language);
  document.querySelectorAll("[data-projects]").forEach((container) => {
    const group = container.dataset.projects;
    const projects = (content.projectItems || [])
      .filter((project) => group === "featured" ? project.tier === "featured" : project.tier !== "featured")
      .sort((first, second) => (first.featuredRank || 99) - (second.featuredRank || 99));
    container.innerHTML = projects.map((project) => projectCardMarkup(project, content)).join("");
  });
}

function renderProjectDetail(language) {
  const content = getContent(language);
  const container = document.querySelector("[data-project-detail]");
  if (!container) return;

  const project = (content.projectItems || []).find((item) => item.id === container.dataset.projectDetail);
  if (!project) {
    container.innerHTML = `<p class="muted">${content.projects.unavailableProject}</p>`;
    return;
  }

  document.title = `${project.title} | ${content.projects.eyebrow}`;
  const description = document.querySelector("meta[data-project-description]");
  if (description) description.setAttribute("content", project.short);

  container.innerHTML = `
    <p class="eyebrow">${content.projects.eyebrow}</p>
    <h1>${project.title}</h1>
    <p class="lead">${project.short}</p>

    <dl class="project-detail-meta">
      <div><dt>${content.projects.typeLabel}</dt><dd>${project.type}</dd></div>
      <div><dt>${content.projects.statusLabel}</dt><dd>${project.status}</dd></div>
    </dl>

    <section>
      <h2>${content.projects.technologiesLabel}</h2>
      <div class="tag-list">${project.tech.map((item) => `<span>${item}</span>`).join("")}</div>
    </section>

    <section>
      <h2>${content.projects.overviewTitle}</h2>
      <p>${project.overview}</p>
    </section>

    <section>
      <h2>${content.projects.methodTitle}</h2>
      <p>${project.method}</p>
    </section>

    <section>
      <h2>${content.projects.resultsTitle}</h2>
      <ul class="plain-list">${project.results.map((item) => `<li>${item}</li>`).join("")}</ul>
    </section>

    <section>
      <h2>${content.projects.requirementsTitle}</h2>
      <p>${project.requirements}</p>
    </section>

    <section class="repository-panel">
      <h2>${content.projects.repositoryTitle}</h2>
      <p>${content.projects.repositoryText}</p>
      <a class="button primary" href="${project.githubUrl}">${content.projects.repositoryLink}</a>
    </section>

    <a class="text-link" href="${getBasePath()}projects.html">${content.projects.backToProjects}</a>
  `;
}

function getBasePath() {
  return window.PORTFOLIO_BASE_PATH || "";
}

function setupExtendedNavigation() {
  const navigationItems = [
    ["home", "index.html", "nav.home"],
    ["about", "about.html", "nav.about"],
    ["research", "research.html", "nav.research"],
    ["black-hole-simulator", "black-hole-simulator.html", "nav.blackHoleSimulator"],
    ["projects", "projects.html", "nav.projects"],
    ["notes", "notes.html", "nav.notes"],
    ["cv", "cv.html", "nav.cv"],
    ["contact", "contact.html", "nav.contact"]
  ];
  document.querySelectorAll(".site-nav").forEach((nav) => {
    nav.innerHTML = navigationItems.map(([id, path, key]) =>
      `<a href="${getBasePath()}${path}" data-nav="${id}" data-i18n="${key}">${id === "black-hole-simulator" ? "Black Hole Simulator" : id[0].toUpperCase() + id.slice(1)}</a>`
    ).join("");
  });
}

function renderResearch(language) {
  const content = getContent(language);
  const container = document.querySelector("[data-research]");
  if (!container) return;

  container.innerHTML = (content.researchItems || []).map((item) => {
    const documentResource = getSharedDocument(item.documentId);
    const pdfPath = documentResource?.available && documentResource.path ? documentResource.path : item.pdf;
    const formatMarkup = item.format
      ? `<div><dt>${item.formatLabel}</dt><dd>${item.format}</dd></div>`
      : "";
    const documentActions = pdfPath
      ? `<div class="actions">
          <a class="button ghost" href="${getBasePath()}${pdfPath}" target="_blank" rel="noopener">${item.documentId ? content.sharedDocuments.openPdf : content.research.readNote}</a>
          <a class="button primary" href="${getBasePath()}${pdfPath}" download>${content.research.downloadPdf}</a>
        </div>`
      : "";
    return `
      <details class="research-card reveal visible" id="${item.id}">
        <summary>
          <p class="status">${item.status}</p>
          <h2>${item.title}</h2>
          <p>${item.summary}</p>
          <dl class="note-meta research-meta">
            <div><dt>${content.research.dateLabel}</dt><dd>${item.date}</dd></div>
            <div><dt>${content.research.statusLabel}</dt><dd>${item.status}</dd></div>
            ${formatMarkup}
          </dl>
        </summary>
        <div class="research-expanded">
          <section>
            <h3>${item.contextTitle || content.research.contextTitle}</h3>
            <p>${item.context}</p>
          </section>
          <section>
            <h3>${item.contributionTitle || content.research.contributionTitle}</h3>
            <p>${item.contribution}</p>
          </section>
          <section class="research-methods-grid">
            <div><h3>${item.methodsTitle || content.research.methodsTitle}</h3><ul class="plain-list">${item.methods.map((method) => `<li>${method}</li>`).join("")}</ul></div>
            <div><h3>${item.resultsTitle || content.research.resultsTitle}</h3><ul class="plain-list">${item.results.map((result) => `<li>${result}</li>`).join("")}</ul></div>
          </section>
          <section>
            <h3>${item.referenceTitle || content.research.referenceTitle}</h3>
            <p><a class="text-link inline-link" href="${item.reference.url}" target="_blank" rel="noopener">${item.reference.title}</a><br><span class="muted">${item.reference.identifier}</span></p>
          </section>
          <section>
            <h3>${item.documentTitle || content.research.noteTitle}</h3>
            <p class="status research-note-label">${item.abstractTitle || content.research.abstractTitle}</p>
            <p>${item.abstract}</p>
            ${documentActions}
          </section>
        </div>
      </details>
    `;
  }).join("");
}

function localizedAcademicValue(value, language) {
  return typeof value === "object" ? value?.[language] || "" : value;
}

function academicFactsMarkup(language, content, compact = false) {
  const profile = window.ACADEMIC_PROFILE;
  const facts = [
    [content.academic.institutionLabel, localizedAcademicValue(profile.institution, language)],
    [content.academic.degreeLabel, localizedAcademicValue(profile.degree, language)],
    [content.academic.averageLabel, profile.weightedAverage],
    [content.academic.fullMarksLabel, `${profile.gradedExamsAtFullMarks}/${profile.gradedExamsCompleted}`],
    [content.academic.honoursLabel, profile.honours],
    [content.academic.creditsLabel, `${profile.earnedCredits} ${profile.creditUnit}`],
    [content.academic.graduationLabel, localizedAcademicValue(profile.expectedGraduation, language)]
  ];
  return `<dl class="academic-facts${compact ? " compact" : ""}">${facts.map(([label, value]) =>
    `<div><dt>${label}</dt><dd>${value}</dd></div>`
  ).join("")}</dl>`;
}

function academicDistinctionsMarkup(content) {
  const profile = window.ACADEMIC_PROFILE;
  const distinctions = [
    [content.academic.averageLabel, profile.weightedAverage],
    [content.academic.fullMarksLabel, `${profile.gradedExamsAtFullMarks}/${profile.gradedExamsCompleted}`],
    [content.academic.honoursLabel, profile.honours],
    [content.academic.creditsLabel, `${profile.earnedCredits} ${profile.creditUnit}`]
  ];
  return `<dl class="academic-facts">${distinctions.map(([label, value]) =>
    `<div><dt>${label}</dt><dd>${value}</dd></div>`
  ).join("")}</dl>`;
}

function courseworkMarkup(language, content, mode) {
  const coursework = window.ACADEMIC_PROFILE.coursework;
  const categories = mode === "completed" ? ["completed"] : ["completed", "current", "planned"];
  const headings = {
    completed: content.cv.completedCourseworkTitle,
    current: content.cv.currentCourseworkTitle,
    planned: content.cv.plannedCourseworkTitle
  };
  return categories.filter((category) => coursework[category].length).map((category) => `
    <section class="coursework-group ${category}">
      <div class="coursework-heading">
        <h3>${headings[category]}</h3>
      </div>
      <ul class="coursework-list">
        ${coursework[category].map((course) => `
          <li>
            <span>${course[language]}</span>
            ${category === "completed" ? `<strong>${course.honours ? content.cv.gradeHonours : content.cv.gradeFull}</strong>` : ""}
          </li>
        `).join("")}
      </ul>
    </section>
  `).join("");
}

function renderAcademicContent(language) {
  const content = getContent(language);
  const profile = window.ACADEMIC_PROFILE;

  document.querySelectorAll("[data-academic-snapshot]").forEach((container) => {
    container.innerHTML = academicFactsMarkup(language, content, true);
  });

  document.querySelectorAll("[data-academic-overview]").forEach((container) => {
    const showCurrentYear = container.dataset.academicOverview !== "cv";
    container.innerHTML = `
      <dl class="info-list">
        <div><dt>${content.about.universityLabel}</dt><dd>${localizedAcademicValue(profile.institution, language)}</dd></div>
        <div><dt>${content.about.degreeLabel}</dt><dd>${localizedAcademicValue(profile.degree, language)}</dd></div>
        ${showCurrentYear ? `<div><dt>${content.about.yearLabel}</dt><dd>${content.about.yearNames[profile.currentYear]}</dd></div>` : ""}
        <div><dt>${content.about.graduationLabel}</dt><dd>${localizedAcademicValue(profile.expectedGraduation, language)}</dd></div>
      </dl>`;
  });

  document.querySelectorAll("[data-academic-distinctions]").forEach((container) => {
    container.innerHTML = academicDistinctionsMarkup(content);
  });

  document.querySelectorAll("[data-coursework]").forEach((container) => {
    container.innerHTML = courseworkMarkup(language, content, container.dataset.coursework || "all");
  });

  const research = content.researchItems?.[0];
  document.querySelectorAll("[data-featured-research]").forEach((container) => {
    if (!research) return;
    container.innerHTML = `
      <p class="status">${content.home.ongoingResearch}</p>
      <h3>${research.title}</h3>
      <dl class="featured-facts">
        <div><dt>${content.home.researchProblemLabel}</dt><dd>${research.context}</dd></div>
        <div><dt>${content.home.contributionLabel}</dt><dd>${research.contribution}</dd></div>
      </dl>
      <a class="text-link" href="${getBasePath()}research.html#${research.id}">${content.home.viewResearch}</a>`;
  });

  document.querySelectorAll("[data-cv-research]").forEach((container) => {
    if (!research) return;
    container.innerHTML = `
      <p class="status">${research.status}</p>
      <h3>${research.title}</h3>
      <p>${research.contribution}</p>
      <a class="text-link" href="${getBasePath()}research.html#${research.id}">${content.cv.viewResearch}</a>`;
  });

  const featuredProjects = (content.projectItems || [])
    .filter((project) => project.tier === "featured")
    .sort((first, second) => first.featuredRank - second.featuredRank);
  const simulator = featuredProjects[0];
  document.querySelectorAll("[data-featured-project]").forEach((container) => {
    if (!simulator) return;
    container.innerHTML = `
      <p class="status">${simulator.status}</p>
      <h3>${simulator.title}</h3>
      <p>${simulator.detail}</p>
      <p class="scientific-pipeline">${content.home.pipeline}</p>
      <a class="button primary" href="${getBasePath()}black-hole-simulator.html#web-demo">${content.home.launchDemo}</a>`;
  });

  document.querySelectorAll("[data-cv-projects]").forEach((container) => {
    container.innerHTML = featuredProjects.map((project) => `
      <article class="cv-project-item">
        <h3>${project.title}</h3>
        <p>${project.short}</p>
        <a class="text-link" href="${getBasePath()}${project.url}">${content.cv.viewProject}</a>
      </article>`).join("");
  });
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
    <article class="subject-card reveal visible">
      <p class="status">${notesBySubject.get(subject.id) || 0} ${(notesBySubject.get(subject.id) || 0) === 1 ? content.notes.noteCountSingular : content.notes.noteCountLabel}</p>
      <h2><a href="${getBasePath()}${subject.url}">${subject.title}</a></h2>
      <p>${subject.description}</p>
      <a class="text-link" href="${getBasePath()}${subject.url}">${content.notes.subjectOpen}</a>
    </article>
  `).join("");
}

function getSharedDocument(documentId) {
  return documentId ? window.PORTFOLIO_DOCUMENTS?.[documentId] : null;
}

function renderSharedDocuments(language) {
  const content = getContent(language);
  document.querySelectorAll("[data-shared-document]").forEach((container) => {
    const documentResource = getSharedDocument(container.dataset.sharedDocument);
    if (!documentResource) return;
    const title = documentResource.title?.[language] || "";
    const titleElement = container.querySelector("[data-shared-document-title]");
    const actionElement = container.querySelector("[data-shared-document-action]");
    if (titleElement) titleElement.textContent = title;
    if (!actionElement) return;
    actionElement.innerHTML = documentResource.available && documentResource.path
      ? `<a class="button ghost" href="${getBasePath()}${documentResource.path}" target="_blank" rel="noopener">${content.sharedDocuments.openPdf}</a>
         <a class="button primary" href="${getBasePath()}${documentResource.path}" download>${content.sharedDocuments.downloadPdf}</a>`
      : `<span class="button disabled" aria-disabled="true" aria-label="${content.sharedDocuments.pending}: ${title}">${content.sharedDocuments.pending}</span>`;
  });
}

function renderSubjectNotes(language) {
  const content = getContent(language);
  const container = document.querySelector("[data-subject-notes]");
  if (!container) return;

  const notes = content.noteItems || [];
  const subjectId = container.dataset.subjectNotes;
  const subject = (content.noteSubjects || []).find((item) => item.id === subjectId);
  const subjectNotes = notes.filter((note) => note.subjectId === subjectId);

  if (!subject) {
    container.innerHTML = `<p class="muted">${content.notes.emptySubject}</p>`;
    return;
  }

  const noteCards = subjectNotes.length
    ? subjectNotes.map((note) => {
        const documentResource = getSharedDocument(note.documentId);
        const title = documentResource?.title?.[language] || note.title;
        const documentAvailable = Boolean(documentResource?.available && documentResource.path);
        const titleMarkup = documentResource
          ? documentAvailable
            ? `<h3><a href="${getBasePath()}${documentResource.path}" target="_blank" rel="noopener">${title}</a></h3>`
            : `<h3>${title}</h3>`
          : `<h3><a href="${getBasePath()}${note.url}">${title}</a></h3>`;
        const actionMarkup = documentResource
          ? documentAvailable
            ? `<div class="actions">
                <a class="button ghost" href="${getBasePath()}${documentResource.path}" target="_blank" rel="noopener">${content.sharedDocuments.openPdf}</a>
                <a class="button primary" href="${getBasePath()}${documentResource.path}" download>${content.sharedDocuments.downloadPdf}</a>
              </div>`
            : `<span class="text-link unavailable" aria-disabled="true">${content.sharedDocuments.pending}</span>`
          : `<a class="text-link" href="${getBasePath()}${note.url}">${content.notes.openNote}</a>`;
        const sharedDocumentDetails = documentResource
          ? `${note.abstract ? `<p>${note.abstract}</p>` : ""}
             ${note.topics?.length ? `<div class="tag-list small">${note.topics.map((topic) => `<span>${topic}</span>`).join("")}</div>` : ""}`
          : "";
        return `
          <article class="note-card reveal visible">
            <p class="status">${note.status}</p>
            ${titleMarkup}
            <p>${note.description}</p>
            ${sharedDocumentDetails}
            <dl class="note-meta">
              <div><dt>${content.notes.dateLabel}</dt><dd>${note.date}</dd></div>
              <div><dt>${content.notes.categoryLabel}</dt><dd>${note.subject}</dd></div>
            </dl>
            ${actionMarkup}
          </article>
        `;
      }).join("")
    : `<p class="muted">${content.notes.emptySubject}</p>`;

  container.innerHTML = `
    <div class="note-subject-heading">
      <p class="eyebrow">${content.notes.eyebrow}</p>
      <h1>${subject.title}</h1>
      <p>${subject.description}</p>
      <a class="text-link" href="${getBasePath()}notes.html">${content.notes.subjectBack}</a>
    </div>
    <div class="note-card-grid">${noteCards}</div>
  `;
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
    ${note.subtitle ? `<p class="lead">${note.subtitle}</p>` : ""}
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
  renderProjectDetail(nextLanguage);
  renderResearch(nextLanguage);
  renderAcademicContent(nextLanguage);
  renderSharedDocuments(nextLanguage);
  renderNoteSubjects(nextLanguage);
  renderSubjectNotes(nextLanguage);
  renderNoteDetail(nextLanguage);

  if (window.updateBlackHoleSimulatorLanguage) {
    window.updateBlackHoleSimulatorLanguage(nextLanguage);
  }

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

  setupExtendedNavigation();
  markActiveNavigation();
  setupNavigationToggle();
  setupRevealAnimations();
  setupProfileImage();
  setLanguage(savedLanguage);
});
