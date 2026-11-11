(() => {
  document.querySelectorAll("[data-image-comparison]").forEach(comparison => {
    const stage = comparison.querySelector("[data-comparison-stage]");
    const slider = comparison.querySelector('input[type="range"]');
    const update = () => {
      const position = Number(slider.value);
      comparison.style.setProperty("--comparison-position", `${position}%`);
      slider.setAttribute("aria-valuetext", `${position}% sky image, ${100 - position}% spectra`);
    };
    slider.addEventListener("input", update);
    const move = event => {
      const bounds = stage.getBoundingClientRect();
      slider.value = Math.round(Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)));
      update();
    };
    let pointer;
    stage.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button !== 0) return;
      pointer = event.pointerId;
      stage.setPointerCapture(pointer);
      move(event);
    });
    stage.addEventListener("pointermove", event => { if (event.pointerId === pointer) move(event); });
    const stop = () => { pointer = undefined; };
    stage.addEventListener("pointerup", stop);
    stage.addEventListener("pointercancel", stop);
    stage.addEventListener("lostpointercapture", stop);
    update();
    comparison.setAttribute("data-ready", "");
    comparison.querySelector(".comparison-controls").hidden = false;
  });
  const resourceLibrary = document.querySelector("[data-resource-library]");
  if (resourceLibrary) {
    const filters = resourceLibrary.querySelector("[data-resource-filters]");
    const buttons = [...filters.querySelectorAll("[data-resource-filter]")];
    const items = [...resourceLibrary.querySelectorAll("[data-resource-item]")];
    const sections = [...resourceLibrary.querySelectorAll("[data-resource-section]")];
    const status = filters.querySelector("[data-resource-status]");
    const selectAudience = button => {
      const audience = button.dataset.resourceFilter;
      buttons.forEach(option => option.setAttribute("aria-pressed", String(option === button)));
      items.forEach(item => { item.hidden = audience !== "all" && !item.dataset.audiences.split(" ").includes(audience); });
      sections.forEach(section => { section.hidden = !section.querySelector("[data-resource-item]:not([hidden])"); });
      const label = audience === "all" ? "all audiences" : button.textContent.trim().toLocaleLowerCase();
      status.textContent = `Showing resources for ${label}.`;
    };
    buttons.forEach(button => button.addEventListener("click", () => selectAudience(button)));
    filters.hidden = false;
    selectAudience(buttons[0]);
  }
  const announcement = document.querySelector(".utility-announcement");
  if (announcement) {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const forcedColors = matchMedia("(forced-colors: active)");
    const mobileAnnouncement = matchMedia("(max-width: 45rem)");
    let rotationTimer;
    const updateAnnouncement = () => {
      clearTimeout(rotationTimer);
      const staticDisplay = reducedMotion.matches || forcedColors.matches;
      announcement.toggleAttribute("data-rotating", !staticDisplay);
      if (staticDisplay) announcement.dataset.frame = "text";
      else announcement.dataset.frame ||= "text";
      if (staticDisplay || mobileAnnouncement.matches || document.hidden || announcement.matches(":hover, :focus-within")) return;
      rotationTimer = setTimeout(() => {
        announcement.dataset.frame = announcement.dataset.frame === "text" ? "logos" : "text";
        updateAnnouncement();
      }, 10000);
    };
    announcement.addEventListener("pointerenter", updateAnnouncement);
    announcement.addEventListener("pointerleave", updateAnnouncement);
    announcement.addEventListener("focusin", updateAnnouncement);
    announcement.addEventListener("focusout", () => setTimeout(updateAnnouncement, 0));
    reducedMotion.addEventListener("change", updateAnnouncement);
    forcedColors.addEventListener("change", updateAnnouncement);
    mobileAnnouncement.addEventListener("change", updateAnnouncement);
    document.addEventListener("visibilitychange", updateAnnouncement);
    updateAnnouncement();
  }
  const searchButton = document.querySelector(".site-search-button");
  const headerTools = document.querySelector(".header-tools");
  const searchForm = headerTools.querySelector("form");
  const searchInput = searchForm.querySelector("input");
  const searchSuggestions = headerTools.querySelector(".search-suggestions");
  const searchResults = searchSuggestions.querySelector(".search-results");
  const searchStatus = searchSuggestions.querySelector(".search-status");
  const searchEntries = JSON.parse(document.querySelector("#site-search-index").textContent);
  const normalizeSearch = value => value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
  let searchTimer;
  const runSearch = () => {
    clearTimeout(searchTimer);
    searchResults.replaceChildren();
    searchResults.hidden = true;
    const query = searchInput.value.trim();
    const terms = normalizeSearch(query).match(/[\p{L}\p{N}]+/gu) || [];
    searchSuggestions.hidden = query.length === 0;
    if (terms.join("").length < 2) {
      searchStatus.textContent = query ? "Enter at least two letters or numbers to search." : "";
      return;
    }
    const matches = searchEntries.map(entry => {
      const title = normalizeSearch(entry.title);
      const text = normalizeSearch(entry.text);
      const score = terms.every(term => title.includes(term) || text.includes(term)) ? terms.reduce((total, term) => total + (title.includes(term) ? 5 : 1), 0) + (title.includes(normalizeSearch(query)) ? 10 : 0) : 0;
      return { ...entry, score };
    }).filter(entry => entry.score > 0).sort((first, second) => second.score - first.score || first.title.localeCompare(second.title));
    for (const entry of matches) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = entry.href;
      link.textContent = entry.title;
      const snippet = document.createElement("p");
      const matchPosition = normalizeSearch(entry.text).indexOf(terms[0]);
      const start = Math.max(0, matchPosition - 45);
      snippet.textContent = `${start > 0 ? "…" : ""}${entry.text.slice(start, start + 180)}${entry.text.length > start + 180 ? "…" : ""}`;
      item.append(link, snippet);
      searchResults.append(item);
    }
    searchResults.hidden = matches.length === 0;
    searchStatus.textContent = matches.length ? `${matches.length} ${matches.length === 1 ? "result" : "results"} for “${query}”.` : `No results for “${query}”. Try a different word or phrase.`;
  };
  searchButton.hidden = false;
  searchButton.addEventListener("click", () => {
    if (!searchForm.hidden) { runSearch(); searchInput.focus(); return; }
    document.querySelectorAll(".app-header details[open]").forEach(details => { details.open = false; });
    headerTools.querySelectorAll(":scope > .menu, :scope > .desktop-navigation").forEach(menu => { menu.inert = true; });
    headerTools.dataset.searchOpen = "true";
    searchForm.hidden = false;
    searchButton.setAttribute("aria-expanded", "true");
    searchInput.focus();
    runSearch();
  });
  const closeSearch = (restoreFocus = true) => {
    clearTimeout(searchTimer);
    searchForm.hidden = true;
    searchSuggestions.hidden = true;
    delete headerTools.dataset.searchOpen;
    headerTools.querySelectorAll(":scope > .menu, :scope > .desktop-navigation").forEach(menu => { menu.inert = false; });
    searchButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) searchButton.focus({ preventScroll: true });
  };
  searchForm.querySelector(".search-close").addEventListener("click", () => closeSearch());
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !searchForm.hidden) { event.preventDefault(); closeSearch(); }
  });
  document.addEventListener("pointerdown", event => {
    if (!searchForm.hidden && !headerTools.contains(event.target)) closeSearch(false);
  });
  searchForm.addEventListener("submit", event => { event.preventDefault(); runSearch(); });
  searchInput.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 250); });
  const backToTop = document.querySelector(".back-to-top");
  const scrollPreferences = matchMedia("(prefers-reduced-motion: reduce)");
  const scrollBehavior = () => scrollPreferences.matches ? "instant" : "smooth";
  if (backToTop) {
    let scrollUpdate;
    const updateBackToTop = () => {
      scrollUpdate = undefined;
      const show = scrollY > Math.max(400, innerHeight * .75);
      if (!show && document.activeElement === backToTop) document.querySelector(".brand").focus({ preventScroll: true });
      backToTop.hidden = !show;
    };
    addEventListener("scroll", () => { scrollUpdate ??= requestAnimationFrame(updateBackToTop); }, { passive: true });
    addEventListener("resize", updateBackToTop);
    backToTop.addEventListener("click", () => {
      document.querySelector(".brand").focus({ preventScroll: true });
      scrollTo({ top: 0, behavior: scrollBehavior() });
    });
    updateBackToTop();
  }
  document.querySelector(".hero-scroll-cue")?.addEventListener("click", event => {
    const destination = document.querySelector("#welcome");
    if (!destination) return;
    event.preventDefault();
    destination.focus({ preventScroll: true });
    destination.scrollIntoView({ block: "start", behavior: scrollBehavior() });
  });
  document.querySelectorAll("[data-news-card-carousel]").forEach(carousel => {
    const track = carousel.querySelector(".news-card-track");
    const cards = [...track.children];
    const controls = carousel.querySelector(".news-card-controls");
    const buttons = [...controls.querySelectorAll("button")];
    const status = carousel.querySelector("[data-news-card-status]");
    let announceNext = false;
    let settleTimer;
    const update = () => {
      const end = track.scrollWidth - track.clientWidth;
      controls.hidden = end <= 2;
      buttons[0].setAttribute("aria-disabled", String(track.scrollLeft <= 2));
      buttons[1].setAttribute("aria-disabled", String(track.scrollLeft >= end - 2));
      if (!announceNext) return;
      const viewport = track.getBoundingClientRect();
      const visible = cards.map((card, index) => ({ index, bounds: card.getBoundingClientRect() }))
        .filter(card => Math.min(card.bounds.right, viewport.right) - Math.max(card.bounds.left, viewport.left) > card.bounds.width / 2);
      if (visible.length) status.textContent = `Stories ${visible[0].index + 1} to ${visible.at(-1).index + 1} of ${cards.length}.`;
      announceNext = false;
    };
    buttons.forEach(button => button.addEventListener("click", () => {
      if (button.getAttribute("aria-disabled") === "true" || cards.length < 2) return;
      announceNext = true;
      const step = cards[1].offsetLeft - cards[0].offsetLeft;
      track.scrollTo({ left: track.scrollLeft + Number(button.dataset.newsDirection) * step, behavior: scrollBehavior() });
    }));
    track.addEventListener("scroll", () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(update, 180);
    }, { passive: true });
    new ResizeObserver(update).observe(track);
    update();
  });
  document.querySelectorAll("[data-image-card-carousel]").forEach(carousel => {
    const track = carousel.querySelector(".image-card-track");
    const cards = [...track.children];
    const buttons = [...carousel.querySelectorAll("[data-image-card-direction]")];
    const status = carousel.querySelector("[data-image-card-status]");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const forcedColors = matchMedia("(forced-colors: active)");
    let settleTimer;
    let announceNext = false;
    let manual = false;
    let pointerDown = false;
    let idleTimer;
    let speed = 0;
    let inView = false;
    let frame;
    let previousTime;
    let position = track.scrollLeft;
    let direction = 1;
    const update = () => {
      const end = track.scrollWidth - track.clientWidth;
      buttons[0].setAttribute("aria-disabled", String(track.scrollLeft <= 2));
      buttons[1].setAttribute("aria-disabled", String(track.scrollLeft >= end - 2));
      if (announceNext) {
        const bounds = track.getBoundingClientRect();
        const visible = cards.map((card, index) => ({ bounds: card.getBoundingClientRect(), index }))
          .filter(card => Math.min(card.bounds.right, bounds.right) - Math.max(card.bounds.left, bounds.left) > card.bounds.width / 2);
        if (visible.length) status.textContent = `Images ${visible[0].index + 1} to ${visible.at(-1).index + 1} of ${cards.length}.`;
        announceNext = false;
      }
    };
    const motionAllowed = () => {
      let savedReduction = false;
      try { savedReduction = localStorage.getItem("euclid-motion-choice") === "reduce"; } catch {}
      return !reducedMotion.matches && !forcedColors.matches && !savedReduction && document.documentElement.dataset.contrast !== "high";
    };
    const tick = time => {
      const elapsed = previousTime === undefined ? 0 : Math.min(time - previousTime, 50);
      previousTime = time;
      const end = Math.max(0, track.scrollWidth - track.clientWidth);
      speed = Math.min(18, speed + elapsed * .0225);
      position = Math.max(0, Math.min(end, position + direction * elapsed * speed / 1000));
      track.scrollLeft = position;
      // Native scroll offsets can round to whole pixels. Preserve the fraction visually.
      track.style.setProperty("--image-scroll-offset", `${track.scrollLeft - position}px`);
      if (position >= end && direction === 1) { direction = -1; speed = 0; }
      else if (position <= 0 && direction === -1) { direction = 1; speed = 0; }
      update();
      frame = requestAnimationFrame(tick);
    };
    const updateScrolling = () => {
      cancelAnimationFrame(frame);
      previousTime = undefined;
      speed = 0;
      const allowed = motionAllowed();
      const reading = carousel.contains(document.activeElement) && document.activeElement.matches(":focus-visible");
      const running = allowed && !manual && !reading && inView && !document.hidden && track.scrollWidth > track.clientWidth;
      carousel.dataset.imageAutoScroll = running ? "running" : manual || reading ? "paused" : "idle";
      track.style.removeProperty("--image-scroll-offset");
      if (running) {
        position = track.scrollLeft;
        // Finish any previous arrow-button scroll before starting the steady drift.
        track.scrollTo({ left: position, behavior: "instant" });
        frame = requestAnimationFrame(tick);
      }
    };
    const resumeWhenIdle = () => {
      clearTimeout(idleTimer);
      if (pointerDown) return;
      idleTimer = setTimeout(() => {
        manual = false;
        updateScrolling();
      }, 1600);
    };
    const stopForInteraction = () => {
      manual = true;
      updateScrolling();
      resumeWhenIdle();
    };
    buttons.forEach(button => button.addEventListener("click", () => {
      stopForInteraction();
      if (button.getAttribute("aria-disabled") === "true") return;
      const step = cards[1].offsetLeft - cards[0].offsetLeft;
      announceNext = true;
      track.scrollTo({ left: track.scrollLeft + Number(button.dataset.imageCardDirection) * step, behavior: scrollBehavior() });
    }));
    carousel.addEventListener("pointerdown", event => {
      pointerDown = true;
      stopForInteraction();
    }, { passive: true });
    const releasePointer = () => {
      if (!pointerDown) return;
      pointerDown = false;
      resumeWhenIdle();
    };
    addEventListener("pointerup", releasePointer, { passive: true });
    addEventListener("pointercancel", releasePointer, { passive: true });
    carousel.addEventListener("wheel", stopForInteraction, { passive: true });
    carousel.addEventListener("focusin", updateScrolling);
    carousel.addEventListener("focusout", () => queueMicrotask(updateScrolling));
    track.addEventListener("scroll", () => {
      if (manual) resumeWhenIdle();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(update, 180);
    }, { passive: true });
    new ResizeObserver(() => { update(); updateScrolling(); }).observe(track);
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      updateScrolling();
    }, { threshold: 0 }).observe(track);
    reducedMotion.addEventListener("change", updateScrolling);
    forcedColors.addEventListener("change", updateScrolling);
    new MutationObserver(updateScrolling).observe(document.documentElement, { attributes: true, attributeFilter: ["data-contrast"] });
    document.addEventListener("visibilitychange", updateScrolling);
    carousel.setAttribute("data-image-scroll-ready", "");
    carousel.querySelector(".image-card-controls").hidden = false;
    update();
    updateScrolling();
  });
  const hero = document.querySelector(".hero");
  const masthead = document.querySelector(".site-masthead");
  const audienceNavigation = masthead.querySelector(".audience-tabs");
  const utilityBar = masthead.querySelector(".utility-bar");
  const mobileMenu = masthead.querySelector(".menu");
  const compactHeader = matchMedia("(max-width: 45rem)");
  const arrangeAudienceNavigation = () => {
    const focusedLink = audienceNavigation.contains(document.activeElement) ? document.activeElement : null;
    (compactHeader.matches ? mobileMenu : utilityBar).append(audienceNavigation);
    focusedLink?.focus({ preventScroll: true });
  };
  arrangeAudienceNavigation();
  compactHeader.addEventListener("change", arrangeAudienceNavigation);
  // Native modal provides focus containment and an inert page behind navigation.
  const menuTrigger = mobileMenu.querySelector(":scope > summary");
  const menuNavigation = mobileMenu.querySelector(":scope > .primary-nav");
  const menuViewport = matchMedia("(max-width: 75rem)");
  const menuDialog = document.createElement("dialog");
  menuDialog.className = "mobile-navigation-dialog";
  menuDialog.id = "mobile-navigation-dialog";
  menuDialog.setAttribute("aria-label", "Menu");
  const menuClose = document.createElement("button");
  menuClose.type = "button";
  menuClose.className = "mobile-navigation-close";
  menuClose.textContent = "Close menu ×";
  menuClose.autofocus = true;
  menuDialog.append(menuClose);
  document.body.append(menuDialog);
  menuTrigger.setAttribute("aria-controls", menuDialog.id);
  menuTrigger.setAttribute("aria-haspopup", "dialog");
  menuTrigger.setAttribute("aria-expanded", "false");
  const restoreMenu = () => {
    mobileMenu.append(menuNavigation);
    arrangeAudienceNavigation();
    document.body.classList.remove("mobile-navigation-open");
    menuTrigger.setAttribute("aria-expanded", "false");
    if (menuViewport.matches) menuTrigger.focus({ preventScroll: true });
  };
  menuDialog.addEventListener("close", restoreMenu);
  menuClose.addEventListener("click", () => menuDialog.close());
  menuTrigger.addEventListener("click", event => {
    if (!menuViewport.matches) return;
    event.preventDefault();
    closeSearch(false);
    menuDialog.append(menuNavigation);
    if (compactHeader.matches) menuDialog.append(audienceNavigation);
    document.body.classList.add("mobile-navigation-open");
    menuTrigger.setAttribute("aria-expanded", "true");
    menuDialog.showModal();
  });
  menuDialog.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const targets = [...menuDialog.querySelectorAll('a[href], button:not([disabled]), summary, input:not([disabled]), [tabindex="0"]')]
      .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    const first = targets[0];
    const last = targets.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  menuDialog.addEventListener("cancel", event => {
    const openSubmenu = menuDialog.querySelector("details[open]");
    if (openSubmenu) {
      event.preventDefault();
      openSubmenu.open = false;
      openSubmenu.querySelector("summary").focus();
    }
  });
  const adaptMenu = () => {
    if (menuDialog.open) menuDialog.close();
  };
  compactHeader.addEventListener("change", adaptMenu);
  menuViewport.addEventListener("change", adaptMenu);
  const updateMasthead = () => {
    const height = masthead.getBoundingClientRect().height;
    const sticky = height < innerHeight * .6;
    masthead.dataset.sticky = String(sticky);
    document.documentElement.style.setProperty("--sticky-masthead-offset", `${sticky ? height : 0}px`);
    document.body.style.setProperty("--hero-header-height", `${height}px`);
  };
  updateMasthead();
  if (document.body.classList.contains("home-hero-header")) document.body.classList.add("header-overlay-ready");
  new ResizeObserver(updateMasthead).observe(masthead);
  addEventListener("resize", updateMasthead);
  if (hero) {
    const slides = [...hero.querySelectorAll(".hero-slide")];
    const controls = hero.querySelector(".carousel-controls");
    const pages = [...controls.querySelectorAll(".carousel-page")];
    const status = controls.querySelector("[data-carousel-status]");
    const visuals = [...hero.querySelectorAll(".hero-visual")];
    const carouselReducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let activeSlide = 0;
    let gesture = null;
    let animations = [];
    let motionToken = 0;
    let suppressClick = false;
    let rotationTimer = null;
    let pointerOver = false;
    let inView = false;
    const restartRotation = () => {
      clearTimeout(rotationTimer);
      rotationTimer = null;
      const stopped = hero.dataset.motionStopped !== "false" || pointerOver || hero.contains(document.activeElement) || gesture !== null || !inView;
      hero.dataset.carouselAutoplay = stopped ? "paused" : "running";
      if (!stopped) rotationTimer = setTimeout(() => {
        rotationTimer = null;
        showSlide(activeSlide + 1, false);
      }, 10000);
    };
    const layers = index => [slides[index], visuals[index]];
    const clearMotion = () => {
      motionToken++;
      animations.forEach(animation => animation.cancel());
      animations = [];
      [...slides, ...visuals].forEach(element => {
        element.classList.remove("is-preview");
        element.style.transform = "";
      });
      hero.dataset.carouselMotion = "idle";
    };
    const animateLayers = positions => {
      if (carouselReducedMotion.matches) { clearMotion(); return; }
      const token = motionToken;
      hero.dataset.carouselMotion = "sliding";
      animations = positions.flatMap(([index, from, to]) => layers(index).map(element => {
        element.classList.add("is-preview");
        element.style.transform = "";
        return element.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration: 450, easing: "cubic-bezier(.22,.68,.18,1)", fill: "both" });
      }));
      Promise.all(animations.map(animation => animation.finished)).then(() => {
        if (token === motionToken) clearMotion();
      }).catch(() => {});
    };
    const showSlide = (index, announce = true, offset = 0) => {
      const nextSlide = (index + slides.length) % slides.length;
      const previousSlide = activeSlide;
      const direction = index >= activeSlide ? 1 : -1;
      clearMotion();
      const moveFocus = slides[activeSlide].contains(document.activeElement);
      slides.forEach((slide, position) => {
        slide.hidden = false;
        slide.inert = position !== nextSlide;
        slide.setAttribute("aria-hidden", String(position !== nextSlide));
        slide.classList.toggle("is-active", position === nextSlide);
        visuals[position].classList.toggle("is-active", position === nextSlide);
      });
      activeSlide = nextSlide;
      hero.dataset.activeSlide = String(activeSlide);
      pages.forEach((page, position) => page.setAttribute("aria-current", String(position === activeSlide)));
      if (moveFocus) pages[activeSlide].focus({ preventScroll: true });
      if (announce) status.textContent = `Slide ${activeSlide + 1} of ${slides.length}: ${slides[activeSlide].dataset.slideName}`;
      if (nextSlide !== previousSlide) animateLayers([[previousSlide, offset, -direction * hero.clientWidth], [nextSlide, offset + direction * hero.clientWidth, 0]]);
      else if (offset) {
        const snapDirection = offset < 0 ? 1 : -1;
        const neighbour = (activeSlide + snapDirection + slides.length) % slides.length;
        animateLayers([[activeSlide, offset, 0], [neighbour, offset + snapDirection * hero.clientWidth, snapDirection * hero.clientWidth]]);
      }
      restartRotation();
    };
    showSlide(0, false);
    hero.dataset.carouselReady = "true";
    controls.hidden = false;
    controls.querySelectorAll("[data-carousel-direction]").forEach(button => button.addEventListener("click", () => showSlide(activeSlide + Number(button.dataset.carouselDirection))));
    pages.forEach((page, index) => page.addEventListener("click", () => showSlide(index)));
    controls.addEventListener("keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      showSlide(event.key === "Home" ? 0 : event.key === "End" ? slides.length - 1 : activeSlide + (event.key === "ArrowRight" ? 1 : -1));
      if (event.target.closest(".carousel-pagination")) pages[activeSlide].focus({ preventScroll: true });
    });
    const releaseGesture = () => {
      const pointer = gesture?.pointer;
      gesture = null;
      if (pointer !== undefined && hero.hasPointerCapture(pointer)) hero.releasePointerCapture(pointer);
    };
    const cancelGesture = () => { releaseGesture(); clearMotion(); restartRotation(); };
    const updateDrag = event => {
      if (!gesture || event.pointerId !== gesture.pointer) return;
      const horizontal = event.clientX - gesture.horizontal;
      const vertical = event.clientY - gesture.vertical;
      if (!gesture.dragging) {
        if (Math.abs(vertical) >= 8 && Math.abs(vertical) >= Math.abs(horizontal)) { cancelGesture(); return; }
        if (Math.abs(horizontal) < 8 || Math.abs(horizontal) <= Math.abs(vertical) * 1.4) return;
        gesture.dragging = true;
        if (event.isTrusted) hero.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      gesture.offset = Math.max(-hero.clientWidth, Math.min(hero.clientWidth, horizontal));
      hero.dataset.carouselMotion = "dragging";
      const direction = horizontal < 0 ? 1 : -1;
      const neighbour = (activeSlide + direction + slides.length) % slides.length;
      [...slides, ...visuals].forEach(element => { element.classList.remove("is-preview"); element.style.transform = ""; });
      layers(activeSlide).forEach(element => { element.style.transform = `translateX(${gesture.offset}px)`; });
      layers(neighbour).forEach(element => { element.classList.add("is-preview"); element.style.transform = `translateX(${gesture.offset + direction * hero.clientWidth}px)`; });
    };
    hero.addEventListener("pointerdown", event => {
      if (event.isPrimary === false) { if (gesture) cancelGesture(); return; }
      if ((event.pointerType === "mouse" && event.button !== 0) || event.target.closest("a, button, input, select, textarea, summary, .carousel-controls")) return;
      clearMotion();
      gesture = { horizontal: event.clientX, vertical: event.clientY, pointer: event.pointerId, started: event.timeStamp, offset: 0, dragging: false };
      restartRotation();
      if (event.pointerType === "mouse") event.preventDefault();
    });
    hero.addEventListener("pointermove", updateDrag);
    hero.addEventListener("pointercancel", cancelGesture);
    hero.addEventListener("lostpointercapture", () => { if (gesture) cancelGesture(); });
    hero.addEventListener("pointerup", event => {
      if (!gesture || event.pointerId !== gesture.pointer) return;
      updateDrag(event);
      if (!gesture) return;
      const { offset, dragging, started } = gesture;
      releaseGesture();
      if (!dragging) { clearMotion(); restartRotation(); return; }
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      const distance = Math.abs(offset);
      const velocity = distance / Math.max(1, event.timeStamp - started);
      const advance = distance >= Math.max(32, Math.min(80, hero.clientWidth * .12)) || (distance >= 16 && velocity > .45);
      showSlide(activeSlide + (advance ? (offset < 0 ? 1 : -1) : 0), advance, offset);
    });
    hero.addEventListener("click", event => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); } }, true);
    hero.addEventListener("focusin", event => { if (animations.length && event.target.closest(".hero-slide.is-active")) clearMotion(); });
    hero.addEventListener("focusin", restartRotation);
    hero.addEventListener("focusout", () => queueMicrotask(restartRotation));
    hero.addEventListener("pointerenter", event => { if (event.pointerType === "touch") return; pointerOver = true; restartRotation(); });
    hero.addEventListener("pointerleave", () => { pointerOver = false; restartRotation(); });
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      restartRotation();
    }, { threshold: 0 }).observe(hero);
    new MutationObserver(restartRotation).observe(hero, { attributes: true, attributeFilter: ["data-motion-stopped"] });
    addEventListener("resize", cancelGesture);
    carouselReducedMotion.addEventListener("change", cancelGesture);
    addEventListener("load", () => visuals.slice(1).forEach(visual => { visual.querySelector(".hero-image").loading = "eager"; }), { once: true });
  }
  if (hero) {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const forcedColors = matchMedia("(forced-colors: active)");
    const finePointer = matchMedia("(any-pointer: fine)");
    const welcome = document.querySelector(".welcome");
    const telescope = document.querySelector(".euclid-outline");
    const resetTelescope = () => {
      telescope?.style.removeProperty("--telescope-x");
      telescope?.style.removeProperty("--telescope-y");
    };
    const readyStarSlides = new Set();
    let userReducedMotion = false;
    try {
      const savedChoice = localStorage.getItem("euclid-motion-choice") ?? localStorage.getItem("euclid-experiment-motion-choice");
      userReducedMotion = savedChoice === "reduce";
      if (savedChoice) localStorage.setItem("euclid-motion-choice", savedChoice);
    } catch {}
    const updateMotion = () => {
      const stopped = userReducedMotion || reducedMotion.matches || forcedColors.matches || document.documentElement.dataset.contrast === "high" || document.hidden;
      if (hero.dataset.motionStopped !== String(stopped)) hero.dataset.motionStopped = String(stopped);
      hero.dataset.starMotion = readyStarSlides.has(hero.dataset.activeSlide) && !stopped ? "running" : "static";
      if (welcome) {
        welcome.dataset.telescopeMotion = !stopped && finePointer.matches ? "interactive" : "static";
        if (welcome.dataset.telescopeMotion === "static") resetTelescope();
      }
    };
    updateMotion();
    hero.querySelectorAll(".hero-visual").forEach((visual, index) => {
      if (!visual.querySelector(".hero-stars")) return;
      const image = visual.querySelector(".hero-image");
      const markReady = () => { readyStarSlides.add(String(index)); updateMotion(); };
      image.addEventListener("load", markReady);
      image.decode().then(markReady).catch(() => {});
    });
    reducedMotion.addEventListener("change", updateMotion);
    forcedColors.addEventListener("change", updateMotion);
    finePointer.addEventListener("change", updateMotion);
    welcome?.addEventListener("pointermove", event => {
      if (welcome.dataset.telescopeMotion !== "interactive" || event.pointerType === "touch") return;
      const bounds = welcome.getBoundingClientRect();
      const horizontal = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const vertical = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      telescope.style.setProperty("--telescope-x", `${-horizontal * 16}px`);
      telescope.style.setProperty("--telescope-y", `${-vertical * 12}px`);
    });
    welcome?.addEventListener("pointerleave", resetTelescope);
    welcome?.addEventListener("pointercancel", resetTelescope);
    new MutationObserver(updateMotion).observe(document.documentElement, { attributes: true, attributeFilter: ["data-contrast"] });
    new MutationObserver(updateMotion).observe(hero, { attributes: true, attributeFilter: ["data-active-slide"] });
    document.addEventListener("visibilitychange", updateMotion);
  }
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const activeDetails = document.activeElement.closest("details[open]") || document.querySelector(".primary-nav details[data-hover-opened][open]");
    if (!activeDetails) return;
    event.preventDefault();
    const returnFocus = activeDetails.contains(document.activeElement);
    activeDetails.open = false;
    delete activeDetails.dataset.hoverOpened;
    if (returnFocus) activeDetails.querySelector("summary").focus();
  });
  document.querySelectorAll(".primary-nav details").forEach(details => {
    const summary = details.querySelector("summary");
    let hoverTimer;
    const hoverMenu = matchMedia("(hover: hover) and (pointer: fine)");
    details.addEventListener("pointerenter", event => {
      if (!details.closest(".desktop-navigation") || !hoverMenu.matches || event.pointerType === "touch") return;
      clearTimeout(hoverTimer);
      if (!details.open) { details.dataset.hoverOpened = "true"; details.open = true; }
    });
    const closeHoverMenu = () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        if (details.dataset.hoverOpened && !details.matches(":hover, :focus-within")) {
          details.open = false;
          delete details.dataset.hoverOpened;
        }
      }, 180);
    };
    details.addEventListener("pointerleave", closeHoverMenu);
    details.addEventListener("focusout", closeHoverMenu);
    summary.addEventListener("click", () => { delete details.dataset.hoverOpened; });
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      details.closest("nav").querySelectorAll("details").forEach(other => {
        if (other !== details) other.open = false;
      });
    });
  });
})();
