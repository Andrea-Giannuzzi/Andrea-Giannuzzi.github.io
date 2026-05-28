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
    container.innerHTML = items.map((item) => `<span>${item}</span>`).join("");
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
