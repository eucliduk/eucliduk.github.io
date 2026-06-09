const app = document.querySelector(".app");
const viewport = document.querySelector(".viewport");
const video = document.querySelector("#camera");
const canvas = document.querySelector("#scanCanvas");
const hotspots = [...document.querySelectorAll(".hotspot")];
const labels = [...document.querySelectorAll(".label")];
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const targetCanvas = document.createElement("canvas");
const targetCtx = targetCanvas.getContext("2d", { willReadFrequently: true });

const TARGET_IMAGE_URLS = [
  "Training%20Images/targets-small/IMG_2564.target.jpg",
  "Training%20Images/targets-small/IMG_2565.target.jpg",
  "Training%20Images/targets-small/IMG_2566.target.jpg",
  "Training%20Images/targets-small/IMG_2567.target.jpg",
  "Training%20Images/targets-small/IMG_2568.target.jpg"
];
const TARGET_MATCH_THRESHOLD = 0.58;
const TARGET_LOCATED_THRESHOLD = 0.52;
const TARGET_LOST_THRESHOLD = 0.44;
const TRACK_BASE_WINDOW = 0.78;
const TRACK_FRAME_INTERVAL = 120;

let stream = null;
let scanId = 0;
let confidence = 0;
let locked = false;
let demoMode = false;
let targetsReady = false;
let targetDescriptors = [];
let bestTargetName = "";
let lastTrackAt = 0;
let trackedPose = { x: 0, y: 0, scale: 1 };
let lastGoodPose = { x: 0, y: 0, scale: 1 };

const params = new URLSearchParams(window.location.search);
if (params.has("reset")) {
  localStorage.removeItem("euclid-ar-calibration");
}

const calibration = { scale: 100, x: 0, y: 0 };

function setBadge(text, mode = "") {
  document.documentElement.dataset.euclidCamera = mode || text.toLowerCase().replace(/\s+/g, "-");
}

function setScan(title, detail) {
  document.documentElement.dataset.euclidScan = title.toLowerCase().replace(/\s+/g, "-");
  document.documentElement.dataset.euclidScanDetail = detail;
}

function updateCalibration() {
  viewport.style.setProperty("--overlay-scale", calibration.scale);
  viewport.style.setProperty("--overlay-x", calibration.x);
  viewport.style.setProperty("--overlay-y", calibration.y);
}

function updateTrackedPose(pose = trackedPose) {
  const viewportWidth = viewport.clientWidth || window.innerWidth || 1;
  const viewportHeight = viewport.clientHeight || window.innerHeight || 1;
  viewport.style.setProperty("--track-x", `${Math.round(pose.x * viewportWidth)}px`);
  viewport.style.setProperty("--track-y", `${Math.round(pose.y * viewportHeight)}px`);
  viewport.style.setProperty("--track-scale", pose.scale.toFixed(3));
}

function resetTrackedPose() {
  trackedPose = { x: 0, y: 0, scale: 1 };
  lastGoodPose = { ...trackedPose };
  updateTrackedPose();
}

function setLocked(value) {
  locked = value;
  app.classList.toggle("is-locked", locked);
  setScan(locked ? "Locked" : "Scanning", locked ? "overlay-active" : "target-search");
}

function stopCamera() {
  if (!stream) return;
  cancelAnimationFrame(scanId);
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
}

async function startCamera() {
  demoMode = false;
  app.classList.remove("is-demo");
  setBadge("Camera starting", "starting");

  try {
    stopCamera();
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
    resetTrackedPose();
    setLocked(false);
    setBadge("Rear camera", "active");
    startScan();
  } catch (error) {
    console.warn("Camera unavailable", error);
    setBadge("Camera blocked", "blocked");
  }
}

function startDemo() {
  demoMode = true;
  stopCamera();
  cancelAnimationFrame(scanId);
  app.classList.add("is-demo");
  resetTrackedPose();
  setLocked(true);
  setBadge("Demo mode", "demo");
}

function resetExperience() {
  confidence = 0;
  calibration.scale = 100;
  calibration.x = 0;
  calibration.y = 0;
  updateCalibration();
  resetTrackedPose();
  setLocked(false);

  if (demoMode) {
    app.classList.remove("is-demo");
    demoMode = false;
    setBadge("Ready", "ready");
  } else if (stream) {
    startScan();
  }
}

function drawSourceCover(context, source, width, height, shiftY = 0.5) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  const sourceSize = Math.min(sourceWidth, sourceHeight);
  const sx = (sourceWidth - sourceSize) / 2;
  const sy = Math.max(0, Math.min(sourceHeight - sourceSize, (sourceHeight - sourceSize) * shiftY));

  context.clearRect(0, 0, width, height);
  context.drawImage(source, sx, sy, sourceSize, sourceSize, 0, 0, width, height);
}

function drawSourceWindow(context, source, width, height, pose) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  const sourceSize = Math.min(sourceWidth, sourceHeight) * pose.window;
  const centerX = sourceWidth * (0.5 + pose.x);
  const centerY = sourceHeight * (0.5 + pose.y);
  const sx = Math.max(0, Math.min(sourceWidth - sourceSize, centerX - sourceSize / 2));
  const sy = Math.max(0, Math.min(sourceHeight - sourceSize, centerY - sourceSize / 2));

  context.clearRect(0, 0, width, height);
  context.drawImage(source, sx, sy, sourceSize, sourceSize, 0, 0, width, height);
}

function normaliseVector(vector) {
  const mean = vector.reduce((sum, value) => sum + value, 0) / vector.length;
  const centered = vector.map((value) => value - mean);
  const norm = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0)) || 1;
  return centered.map((value) => value / norm);
}

function createDescriptor(imageData, width, height) {
  const { data } = imageData;
  const lumaCells = new Array(64).fill(0);
  const edgeCells = new Array(64).fill(0);
  const chromaCells = new Array(32).fill(0);
  const lumaCounts = new Array(64).fill(0);
  const chromaCounts = new Array(16).fill(0);
  const row = width * 4;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      const right = data[i + 4] * 0.299 + data[i + 5] * 0.587 + data[i + 6] * 0.114;
      const below = data[i + row] * 0.299 + data[i + row + 1] * 0.587 + data[i + row + 2] * 0.114;
      const edge = Math.abs(luma - right) + Math.abs(luma - below);
      const cellX = Math.min(7, Math.floor((x / width) * 8));
      const cellY = Math.min(7, Math.floor((y / height) * 8));
      const cell = cellY * 8 + cellX;
      const chromaX = Math.min(3, Math.floor((x / width) * 4));
      const chromaY = Math.min(3, Math.floor((y / height) * 4));
      const chromaCell = chromaY * 4 + chromaX;

      lumaCells[cell] += luma;
      edgeCells[cell] += edge;
      chromaCells[chromaCell] += r - b;
      chromaCells[chromaCell + 16] += g - b;
      lumaCounts[cell] += 1;
      chromaCounts[chromaCell] += 1;
    }
  }

  for (let i = 0; i < 64; i += 1) {
    lumaCells[i] /= lumaCounts[i] || 1;
    edgeCells[i] /= lumaCounts[i] || 1;
  }

  for (let i = 0; i < 16; i += 1) {
    chromaCells[i] /= chromaCounts[i] || 1;
    chromaCells[i + 16] /= chromaCounts[i] || 1;
  }

  return {
    luma: normaliseVector(lumaCells),
    edge: normaliseVector(edgeCells),
    chroma: normaliseVector(chromaCells)
  };
}

function cosineSimilarity(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }
  return (sum + 1) / 2;
}

function scoreDescriptors(a, b) {
  return (
    cosineSimilarity(a.luma, b.luma) * 0.54 +
    cosineSimilarity(a.edge, b.edge) * 0.32 +
    cosineSimilarity(a.chroma, b.chroma) * 0.14
  );
}

function findBestTargetMatch(descriptor) {
  let bestScore = 0;
  let bestName = "";

  targetDescriptors.forEach((target) => {
    target.variants.forEach((variant) => {
      const score = scoreDescriptors(descriptor, variant);
      if (score > bestScore) {
        bestScore = score;
        bestName = target.name;
      }
    });
  });

  return { score: bestScore, name: bestName };
}

function getCandidatePoses() {
  if (locked) {
    const center = lastGoodPose;
    const offsets = [-0.09, 0, 0.09];
    const windows = [
      Math.max(0.48, Math.min(1, TRACK_BASE_WINDOW / (center.scale * 1.16))),
      Math.max(0.48, Math.min(1, TRACK_BASE_WINDOW / center.scale)),
      Math.max(0.48, Math.min(1, TRACK_BASE_WINDOW / (center.scale * 0.88)))
    ];

    return windows.flatMap((windowSize) => (
      offsets.flatMap((dy) => offsets.map((dx) => ({
        x: Math.max(-0.32, Math.min(0.32, center.x + dx)),
        y: Math.max(-0.32, Math.min(0.32, center.y + dy)),
        window: windowSize
      })))
    ));
  }

  const offsets = [-0.24, -0.12, 0, 0.12, 0.24];
  const windows = [0.52, 0.66, TRACK_BASE_WINDOW, 0.9, 1];
  return windows.flatMap((windowSize) => (
    offsets.flatMap((dy) => offsets.map((dx) => ({ x: dx, y: dy, window: windowSize })))
  ));
}

function smoothTrackedPose(pose, score) {
  const targetScale = Math.max(0.7, Math.min(1.55, TRACK_BASE_WINDOW / pose.window));
  const targetPose = {
    x: pose.x,
    y: pose.y,
    scale: targetScale
  };
  const smoothing = locked ? 0.28 : 0.5;

  trackedPose = {
    x: trackedPose.x + (targetPose.x - trackedPose.x) * smoothing,
    y: trackedPose.y + (targetPose.y - trackedPose.y) * smoothing,
    scale: trackedPose.scale + (targetPose.scale - trackedPose.scale) * smoothing
  };

  if (score > TARGET_LOST_THRESHOLD) {
    lastGoodPose = { ...trackedPose };
  }

  updateTrackedPose(trackedPose);
}

function scoreCameraFrame() {
  if (!video.videoWidth || !video.videoHeight) return { score: 0, name: "", pose: lastGoodPose };

  let best = { score: 0, name: "", pose: lastGoodPose };
  getCandidatePoses().forEach((pose) => {
    drawSourceWindow(ctx, video, canvas.width, canvas.height, pose);
    const descriptor = createDescriptor(ctx.getImageData(0, 0, canvas.width, canvas.height), canvas.width, canvas.height);
    const match = findBestTargetMatch(descriptor);
    if (match.score > best.score) {
      best = { ...match, pose };
    }
  });
  return best;
}

function startScan() {
  cancelAnimationFrame(scanId);

  const tick = (timestamp = 0) => {
    if (!stream) return;

    if (timestamp - lastTrackAt < TRACK_FRAME_INTERVAL) {
      scanId = requestAnimationFrame(tick);
      return;
    }
    lastTrackAt = timestamp;

    if (!targetsReady) {
      scanId = requestAnimationFrame(tick);
      return;
    }

    const match = scoreCameraFrame();
    confidence = confidence * 0.72 + match.score * 0.28;
    bestTargetName = match.name;
    if (match.score > TARGET_LOST_THRESHOLD) {
      smoothTrackedPose(match.pose, match.score);
    }

    setScan(locked ? "Tracking" : "Scanning", bestTargetName);

    if (!locked && confidence > TARGET_MATCH_THRESHOLD) {
      setLocked(true);
    }

    scanId = requestAnimationFrame(tick);
  };

  scanId = requestAnimationFrame(tick);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function buildTargetDescriptor(url) {
  const image = await loadImage(url);
  targetCanvas.width = canvas.width;
  targetCanvas.height = canvas.height;

  const variants = [0.34, 0.5, 0.66].map((shiftY) => {
    drawSourceCover(targetCtx, image, targetCanvas.width, targetCanvas.height, shiftY);
    return createDescriptor(
      targetCtx.getImageData(0, 0, targetCanvas.width, targetCanvas.height),
      targetCanvas.width,
      targetCanvas.height
    );
  });

  return {
    name: url.split("/").pop().replace(".target.jpg", ""),
    url,
    variants
  };
}

async function loadTrainingTargets() {
  const results = await Promise.allSettled(TARGET_IMAGE_URLS.map(buildTargetDescriptor));
  targetDescriptors = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  targetsReady = targetDescriptors.length > 0;
  document.documentElement.dataset.euclidTargets = String(targetDescriptors.length);

  if (targetsReady) {
    if (!demoMode && !locked && !stream) {
      setBadge("Targets ready", "ready");
    }
  } else {
    setBadge("Unavailable", "unavailable");
  }
}

function activateLabel(name) {
  labels.forEach((label) => {
    label.classList.toggle("is-active", label.dataset.label === name);
  });
}

hotspots.forEach((hotspot) => {
  hotspot.addEventListener("pointerenter", () => {
    const name = hotspot.className.match(/hotspot-([a-z]+)/)?.[1];
    if (name) activateLabel(name);
  });

  hotspot.addEventListener("click", () => {
    const name = hotspot.className.match(/hotspot-([a-z]+)/)?.[1];
    if (name) activateLabel(name);
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(scanId);
  } else if (stream) {
    startScan();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

window.euclidARDebug = {
  getTargets: () => targetDescriptors.map((target) => target.name),
  scoreImageUrl: async (url) => {
    const descriptor = await buildTargetDescriptor(url);
    return descriptor.variants.map(findBestTargetMatch);
  }
};

updateCalibration();
resetTrackedPose();
setBadge("Ready", "ready");
loadTrainingTargets().then(() => {
  if (params.has("demo")) {
    startDemo();
  } else if (params.has("lock")) {
    setLocked(true);
  } else {
    startCamera();
  }
});
