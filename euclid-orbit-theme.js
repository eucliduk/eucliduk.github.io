(() => {
  const contrastKey = "euclid-contrast-choice";
  const requestedContrast = new URLSearchParams(window.location.search).get("contrast");
  let contrast = "standard";
  try {
    contrast = localStorage.getItem(contrastKey) === "high" ? "high" : "standard";
    if (requestedContrast === "high" || requestedContrast === "standard") {
      contrast = requestedContrast;
      localStorage.setItem(contrastKey, contrast);
    }
  } catch {
    if (requestedContrast === "high") contrast = "high";
  }
  document.documentElement.dataset.contrast = contrast;

  const preferenceKey = "euclid-theme-choice";
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let savedTheme = null;

  try {
    savedTheme = localStorage.getItem(preferenceKey);
  } catch {}

  function applyTheme() {
    const theme = savedTheme === "light" || savedTheme === "dark"
      ? savedTheme
      : systemTheme.matches ? "dark" : "light";
    if (document.documentElement.getAttribute("data-theme") !== theme) {
      document.documentElement.classList.add("is-changing-theme");
      document.documentElement.setAttribute("data-theme", theme);
      requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove("is-changing-theme")));
    }
    const toggle = document.getElementById("theme-toggle");
    if (!toggle) return;
    const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    toggle.setAttribute("aria-pressed", String(theme === "dark"));
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("title", label);
  }

  applyTheme();

  function initializeToggle() {
    const toggle = document.getElementById("theme-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", () => {
      savedTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(preferenceKey, savedTheme);
      } catch {}
      applyTheme();
    });
    applyTheme();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeToggle, { once: true });
  } else {
    initializeToggle();
  }

  systemTheme.addEventListener("change", applyTheme);
  window.addEventListener("storage", (event) => {
    if (event.key === contrastKey || event.key === null) {
      document.documentElement.dataset.contrast = event.key === contrastKey && event.newValue === "high" ? "high" : "standard";
      window.dispatchEvent(new Event("euclid-contrast-change"));
    }
    if (event.key !== preferenceKey && event.key !== null) return;
    savedTheme = event.newValue;
    applyTheme();
  });
})();
