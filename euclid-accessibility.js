(() => {
  const header = document.querySelector(".app-header");
  const announcement = document.querySelector(".announcement-bar");
  const timeline = document.querySelector(".timeline-control");
  const root = document.documentElement;

  function updateContrastLinks() {
    const highContrast = root.dataset.contrast === "high";
    document.querySelectorAll("[data-contrast-toggle]").forEach(link => {
      const destination = new URL(window.location.href);
      destination.searchParams.set("contrast", highContrast ? "standard" : "high");
      link.href = destination.href;
      link.textContent = highContrast ? "Standard contrast version" : "High contrast version";
    });
  }
  updateContrastLinks();
  window.addEventListener("euclid-contrast-change", updateContrastLinks);

  function measureHeader() {
    const safeTop = parseFloat(getComputedStyle(root).getPropertyValue("--safe-top")) || 0;
    if (header) root.style.setProperty("--header-height", `${Math.ceil(header.getBoundingClientRect().height - safeTop)}px`);
    if (announcement) root.style.setProperty("--announcement-height", `${Math.ceil(announcement.getBoundingClientRect().height)}px`);
    if (timeline) root.style.setProperty("--timeline-height", `${Math.ceil(timeline.getBoundingClientRect().height)}px`);
  }

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(measureHeader);
    if (header) observer.observe(header);
    if (announcement) observer.observe(announcement);
    if (timeline) observer.observe(timeline);
  }
  measureHeader();

  document.querySelectorAll(".skip-link").forEach(link => {
    link.addEventListener("click", event => {
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start", behavior: "auto" });
    });
  });

  const detailsLink = document.getElementById("orbit-details-link");
  const infoDialog = document.getElementById("info-dialog");
  document.getElementById("info-button")?.addEventListener("click", () => {
    if (infoDialog && !infoDialog.open) infoDialog.showModal();
  });
  detailsLink?.addEventListener("click", event => {
    if (!infoDialog) return;
    event.preventDefault();
    infoDialog.showModal();
  });

  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  motionPreference.addEventListener("change", event => {
    if (event.matches) document.querySelectorAll("video[aria-hidden='true']").forEach(video => video.pause());
  });
})();
