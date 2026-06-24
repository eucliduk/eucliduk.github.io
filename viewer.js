const SCENES = {
  image: {
    tileSource: "tiles/galactic-centre.dzi",
    width: 27000,
    height: 22500,
    contentBounds: {
      x: 0,
      y: 0,
      width: 27000,
      height: 22500,
    },
    areaSqDeg: 4.8,
    showFeatures: true,
  },
  behind: {
    tileSource: "tiles/behind-the-scenes.dzi",
    width: 29204,
    height: 24000,
    contentBounds: {
      x: -1468,
      y: -1330,
      width: 32142,
      height: 26672,
    },
    areaSqDeg: 4.8,
    showFeatures: false,
  },
};
const EUCLID_FIELD_OF_VIEW_SQ_DEG = 0.54;
const FIELD_OF_VIEW_STATUS_COLLAPSED_KEY = "galactic-centre-fov-status-collapsed";
const FEATURE_ZOOM_DURATION_MS = 4200;
const MOLECULAR_CLOUD = {
  highlight: {
    x: 21445,
    y: 13281,
    width: 1750,
    height: 1750,
  },
  zoom: {
    x: 20780,
    y: 12880,
    width: 3320,
    height: 2320,
  },
};
const NEBULA = {
  highlight: {
    x: 8750,
    y: 5550,
    width: 1600,
    height: 1600,
  },
  zoom: {
    x: 7950,
    y: 5650,
    width: 2450,
    height: 1390,
  },
};
const STAR_CLUSTER = {
  highlight: {
    x: 20356,
    y: 6048,
    width: 1800,
    height: 1800,
  },
  zoom: {
    x: 19350,
    y: 5700,
    width: 3550,
    height: 2000,
  },
};
const COUNTLESS_STARS = {
  highlight: {
    x: 14336,
    y: 14704,
    width: 2400,
    height: 2400,
  },
  zoom: {
    x: 13500,
    y: 14000,
    width: 4700,
    height: 3600,
  },
};
const PIPELINE_COMPARISON = {
  scene: "behind",
  highlight: {
    x: 13902,
    y: 11300,
    width: 1400,
    height: 1400,
  },
  zoom: {
    x: 11720,
    y: 9695,
    width: 5760,
    height: 4512,
  },
};

const viewer = OpenSeadragon({
  id: "viewer",
  tileSources: SCENES.image.tileSource,
  showNavigationControl: false,
  showNavigator: true,
  navigatorPosition: "BOTTOM_RIGHT",
  navigatorSizeRatio: 0.16,
  navigatorMaintainSizeRatio: true,
  navigatorAutoFade: false,
  animationTime: 0.65,
  springStiffness: 6.5,
  blendTime: 0.08,
  constrainDuringPan: true,
  visibilityRatio: 0.8,
  minZoomImageRatio: 0.42,
  maxZoomPixelRatio: 6,
  homeFillsViewer: false,
  gestureSettingsMouse: {
    scrollToZoom: true,
    clickToZoom: false,
    dblClickToZoom: false,
    pinchToZoom: true,
  },
  gestureSettingsTouch: {
    scrollToZoom: false,
    pinchToZoom: true,
    clickToZoom: false,
    dblClickToZoom: false,
    flickEnabled: true,
  },
});

let activeSceneName = "image";
let activeScene = SCENES[activeSceneName];
const fieldOfViewValue = document.getElementById("fov-value");
const fieldOfViewStatus = document.getElementById("fov-status");
const fieldOfViewToggle = document.getElementById("fov-toggle");
const sceneToggle = document.getElementById("scene-toggle");
const sceneToggleLabel = sceneToggle.querySelector(".mode-switch__label");
const astronomerOpen = document.getElementById("astronomer-open");
const astronomerOverlay = document.getElementById("astronomer-overlay");
const astronomerClose = document.getElementById("astronomer-close");
const astronomerVideo = document.getElementById("astronomer-video");
const playlistItems = [...document.querySelectorAll(".video-playlist__item")];
const molecularCloudHotspot = document.getElementById("molecular-cloud-hotspot");
const molecularCloudPanel = document.getElementById("molecular-cloud-panel");
const molecularCloudClose = document.getElementById("molecular-cloud-close");
const nebulaHotspot = document.getElementById("nebula-hotspot");
const nebulaPanel = document.getElementById("nebula-panel");
const nebulaClose = document.getElementById("nebula-close");
const starClusterHotspot = document.getElementById("star-cluster-hotspot");
const starClusterPanel = document.getElementById("star-cluster-panel");
const starClusterClose = document.getElementById("star-cluster-close");
const countlessStarsHotspot = document.getElementById("countless-stars-hotspot");
const countlessStarsPanel = document.getElementById("countless-stars-panel");
const countlessStarsClose = document.getElementById("countless-stars-close");
const pipelineHotspot = document.getElementById("pipeline-hotspot");
const pipelinePanel = document.getElementById("pipeline-panel");
const pipelineClose = document.getElementById("pipeline-close");
const featureHotspots = [
  { hotspot: molecularCloudHotspot, feature: MOLECULAR_CLOUD, scene: "image" },
  { hotspot: nebulaHotspot, feature: NEBULA, scene: "image" },
  { hotspot: starClusterHotspot, feature: STAR_CLUSTER, scene: "image" },
  { hotspot: countlessStarsHotspot, feature: COUNTLESS_STARS, scene: "image" },
  { hotspot: pipelineHotspot, feature: PIPELINE_COMPARISON, scene: "behind" },
];
let featureZoomAnimationFrame = null;
let pendingSceneRect = null;

function formatFieldOfView(value) {
  if (value >= 1) {
    return value.toFixed(2);
  }

  if (value <= 0) {
    return "0";
  }

  const niceDenominators = [2, 3, 4, 5, 10, 20, 30, 40, 50, 75, 100];
  let bestDenominator = niceDenominators[0];
  let bestError = Infinity;

  niceDenominators.forEach((denominator) => {
    const error = Math.abs(value - 1 / denominator);
    if (error < bestError) {
      bestError = error;
      bestDenominator = denominator;
    }
  });

  return `~1/${bestDenominator}`;
}

function visibleImageArea() {
  const bounds = viewer.viewport.viewportToImageRectangle(viewer.viewport.getBounds(true));
  const contentBounds = activeScene.contentBounds;
  const left = Math.max(contentBounds.x, bounds.x);
  const top = Math.max(contentBounds.y, bounds.y);
  const right = Math.min(contentBounds.x + contentBounds.width, bounds.x + bounds.width);
  const bottom = Math.min(contentBounds.y + contentBounds.height, bounds.y + bounds.height);

  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function updateStatus() {
  if (!viewer.viewport) {
    return;
  }

  const imageArea = activeScene.contentBounds.width * activeScene.contentBounds.height;
  const imageAreaInEuclidFields = activeScene.areaSqDeg / EUCLID_FIELD_OF_VIEW_SQ_DEG;
  const fieldOfViewCount = (visibleImageArea() / imageArea) * imageAreaInEuclidFields;
  fieldOfViewValue.textContent = formatFieldOfView(fieldOfViewCount);
}

function zoomBy(factor) {
  viewer.viewport.zoomBy(factor);
  viewer.viewport.applyConstraints();
}

function imageRectToViewportRect(rect) {
  return viewer.viewport.imageToViewportRectangle(rect.x, rect.y, rect.width, rect.height);
}

function sceneHomeRect(scene = activeScene) {
  return { ...scene.contentBounds };
}

function sceneRectToNormalisedRect(rect, scene) {
  const contentBounds = scene.contentBounds;
  return {
    x: (rect.x - contentBounds.x) / contentBounds.width,
    y: (rect.y - contentBounds.y) / contentBounds.height,
    width: rect.width / contentBounds.width,
    height: rect.height / contentBounds.height,
  };
}

function normalisedRectToSceneRect(rect, scene) {
  const contentBounds = scene.contentBounds;
  return {
    x: contentBounds.x + rect.x * contentBounds.width,
    y: contentBounds.y + rect.y * contentBounds.height,
    width: rect.width * contentBounds.width,
    height: rect.height * contentBounds.height,
  };
}

function fitSceneRect(rect, immediately = false) {
  viewer.viewport.fitBounds(imageRectToViewportRect(rect), immediately);
  viewer.viewport.applyConstraints();
}

function goSceneHome(immediately = false) {
  hideFeaturePanels();
  fitSceneRect(sceneHomeRect(), immediately);
  positionFeatureHotspots();
  updateStatus();
}

function imageRectCenterToViewportPoint(rect) {
  return viewer.viewport.imageToViewportCoordinates(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

function addFeatureHotspot(hotspot, feature) {
  hotspot.classList.add("feature-hotspot--ready");
  positionFeatureHotspot(hotspot, feature);
}

function positionFeatureHotspot(hotspot, feature) {
  if (!viewer.viewport) {
    return;
  }

  const pixel = viewer.viewport.pixelFromPoint(imageRectCenterToViewportPoint(feature.highlight), true);
  hotspot.style.left = `${pixel.x - hotspot.offsetWidth / 2}px`;
  hotspot.style.top = `${pixel.y - hotspot.offsetHeight / 2}px`;
}

function positionFeatureHotspots() {
  featureHotspots.forEach(({ hotspot, feature, scene }) => {
    if (scene === activeSceneName) {
      positionFeatureHotspot(hotspot, feature);
    }
  });
}

function setFeatureHotspotsEnabled() {
  featureHotspots.forEach(({ hotspot, scene }) => {
    const enabled = scene === activeSceneName;
    hotspot.hidden = !enabled;
    hotspot.classList.toggle("feature-hotspot--ready", enabled);
  });
}

function addFeatureHotspots() {
  setFeatureHotspotsEnabled();
  featureHotspots.forEach(({ hotspot, feature, scene }) => {
    if (scene === activeSceneName) {
      addFeatureHotspot(hotspot, feature);
    }
  });
}

function hideFeaturePanels() {
  molecularCloudPanel.hidden = true;
  nebulaPanel.hidden = true;
  starClusterPanel.hidden = true;
  countlessStarsPanel.hidden = true;
  pipelinePanel.hidden = true;
}

function setSceneToggleLabel(mainText) {
  const mainLine = document.createElement("span");
  const imageLine = document.createElement("span");
  mainLine.className = "mode-switch__label-main";
  imageLine.className = "mode-switch__label-mode";
  mainLine.textContent = mainText;
  imageLine.textContent = "Image";
  sceneToggleLabel.replaceChildren(mainLine, imageLine);
}

function updateSceneToggle() {
  const isBehind = activeSceneName === "behind";
  setSceneToggleLabel(isBehind ? "Processed" : "Raw VIS");
  sceneToggle.setAttribute("aria-pressed", isBehind ? "true" : "false");
  sceneToggle.setAttribute(
    "aria-label",
    isBehind ? "Switch to Processed Image" : "Switch to Raw VIS Image",
  );
  sceneToggle.setAttribute("title", isBehind ? "Switch to Processed Image" : "Switch to Raw VIS Image");
}

function switchScene(sceneName) {
  if (!SCENES[sceneName] || sceneName === activeSceneName) {
    return;
  }

  if (featureZoomAnimationFrame !== null) {
    window.cancelAnimationFrame(featureZoomAnimationFrame);
    featureZoomAnimationFrame = null;
  }

  const currentNormalisedRect = sceneRectToNormalisedRect(currentImageRect(), activeScene);

  activeSceneName = sceneName;
  activeScene = SCENES[activeSceneName];
  pendingSceneRect = normalisedRectToSceneRect(currentNormalisedRect, activeScene);
  hideFeaturePanels();
  setFeatureHotspotsEnabled();
  updateSceneToggle();
  viewer.open(activeScene.tileSource);
}

function easeOutSine(progress) {
  return Math.sin((progress * Math.PI) / 2);
}

function interpolateRect(from, to, progress) {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
    width: from.width + (to.width - from.width) * progress,
    height: from.height + (to.height - from.height) * progress,
  };
}

function currentImageRect() {
  return viewer.viewport.viewportToImageRectangle(viewer.viewport.getBounds(true));
}

function animateToImageRect(targetRect) {
  if (featureZoomAnimationFrame !== null) {
    window.cancelAnimationFrame(featureZoomAnimationFrame);
  }

  const startRect = currentImageRect();
  const startTime = performance.now();

  const step = (now) => {
    const progress = Math.min((now - startTime) / FEATURE_ZOOM_DURATION_MS, 1);
    const easedProgress = easeOutSine(progress);
    const nextRect = interpolateRect(startRect, targetRect, easedProgress);

    viewer.viewport.fitBounds(imageRectToViewportRect(nextRect), true);
    positionFeatureHotspots();
    updateStatus();

    if (progress < 1) {
      featureZoomAnimationFrame = window.requestAnimationFrame(step);
    } else {
      featureZoomAnimationFrame = null;
    }
  };

  featureZoomAnimationFrame = window.requestAnimationFrame(step);
}

function showFeature(feature, panel) {
  hideFeaturePanels();
  panel.hidden = false;
  animateToImageRect(feature.zoom);
}

function bindFeatureHotspot(hotspot, feature, panel) {
  let lastActivation = 0;

  const activate = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const now = Date.now();
    if (now - lastActivation < 350) {
      return;
    }

    lastActivation = now;
    showFeature(feature, panel);
  };

  hotspot.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  hotspot.addEventListener("pointerup", activate);
  hotspot.addEventListener("click", activate);
  hotspot.addEventListener("touchend", activate);
}

function setFieldOfViewStatusCollapsed(collapsed) {
  fieldOfViewStatus.classList.toggle("status--collapsed", collapsed);
  fieldOfViewToggle.setAttribute(
    "aria-label",
    collapsed ? "Show field of view information" : "Hide field of view information",
  );
  fieldOfViewToggle.setAttribute(
    "title",
    collapsed ? "Show field of view information" : "Hide field of view information",
  );
  fieldOfViewToggle.querySelector("span").textContent = collapsed ? "i" : "\u00d7";
  localStorage.setItem(FIELD_OF_VIEW_STATUS_COLLAPSED_KEY, collapsed ? "true" : "false");
}

document.getElementById("zoom-in").addEventListener("click", () => zoomBy(1.7));
document.getElementById("zoom-out").addEventListener("click", () => zoomBy(1 / 1.7));
document.getElementById("home").addEventListener("click", () => goSceneHome());
sceneToggle.addEventListener("click", () => {
  switchScene(activeSceneName === "behind" ? "image" : "behind");
});
fieldOfViewToggle.addEventListener("click", () => {
  setFieldOfViewStatusCollapsed(!fieldOfViewStatus.classList.contains("status--collapsed"));
});
bindFeatureHotspot(molecularCloudHotspot, MOLECULAR_CLOUD, molecularCloudPanel);
molecularCloudClose.addEventListener("click", () => {
  molecularCloudPanel.hidden = true;
  molecularCloudHotspot.focus();
});
bindFeatureHotspot(nebulaHotspot, NEBULA, nebulaPanel);
nebulaClose.addEventListener("click", () => {
  nebulaPanel.hidden = true;
  nebulaHotspot.focus();
});
bindFeatureHotspot(starClusterHotspot, STAR_CLUSTER, starClusterPanel);
starClusterClose.addEventListener("click", () => {
  starClusterPanel.hidden = true;
  starClusterHotspot.focus();
});
bindFeatureHotspot(countlessStarsHotspot, COUNTLESS_STARS, countlessStarsPanel);
countlessStarsClose.addEventListener("click", () => {
  countlessStarsPanel.hidden = true;
  countlessStarsHotspot.focus();
});
bindFeatureHotspot(pipelineHotspot, PIPELINE_COMPARISON, pipelinePanel);
pipelineClose.addEventListener("click", () => {
  pipelinePanel.hidden = true;
  pipelineHotspot.focus();
});

document.getElementById("fullscreen").addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
});

function openAstronomerOverlay() {
  astronomerOverlay.hidden = false;
  astronomerOpen.setAttribute("aria-expanded", "true");
  astronomerClose.focus();
}

function closeAstronomerOverlay() {
  astronomerOverlay.hidden = true;
  astronomerOpen.setAttribute("aria-expanded", "false");
  astronomerVideo.pause();
  astronomerOpen.focus();
}

function setAstronomerVideo(button) {
  const nextSource = button.dataset.video;
  if (!nextSource || astronomerVideo.getAttribute("src") === nextSource) {
    return;
  }

  astronomerVideo.pause();
  astronomerVideo.setAttribute("src", nextSource);
  astronomerVideo.load();
  playlistItems.forEach((item) => item.classList.toggle("video-playlist__item--active", item === button));
}

astronomerOpen.setAttribute("aria-expanded", "false");
astronomerOpen.addEventListener("click", openAstronomerOverlay);
astronomerClose.addEventListener("click", closeAstronomerOverlay);
astronomerOverlay.addEventListener("click", (event) => {
  if (event.target === astronomerOverlay) {
    closeAstronomerOverlay();
  }
});
playlistItems.forEach((button) => {
  button.addEventListener("click", () => setAstronomerVideo(button));
});

viewer.addHandler("open", () => {
  if (pendingSceneRect) {
    fitSceneRect(pendingSceneRect, true);
    pendingSceneRect = null;
  } else {
    goSceneHome(true);
  }
  addFeatureHotspots();
  positionFeatureHotspots();
  updateStatus();
});

viewer.addHandler("animation", () => {
  positionFeatureHotspots();
  updateStatus();
});
viewer.addHandler("pan", () => {
  positionFeatureHotspots();
  updateStatus();
});
viewer.addHandler("zoom", () => {
  positionFeatureHotspots();
  updateStatus();
});

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return;
  }

  if (event.key === "+" || event.key === "=") {
    zoomBy(1.35);
  }

  if (event.key === "-" || event.key === "_") {
    zoomBy(1 / 1.35);
  }

  if (event.key.toLowerCase() === "h") {
    goSceneHome();
  }

  if (event.key.toLowerCase() === "b") {
    switchScene(activeSceneName === "behind" ? "image" : "behind");
  }

  if (event.key === "Escape" && !astronomerOverlay.hidden) {
    closeAstronomerOverlay();
  }
});

window.addEventListener("load", updateStatus);
setFieldOfViewStatusCollapsed(localStorage.getItem(FIELD_OF_VIEW_STATUS_COLLAPSED_KEY) === "true");
updateSceneToggle();
