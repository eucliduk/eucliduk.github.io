const app = document.querySelector(".app");
const viewport = document.querySelector(".viewport");
const video = document.querySelector("#camera");
const canvas = document.querySelector("#scanCanvas");
const scanState = document.querySelector("#scanState");
const scanDetail = document.querySelector("#scanDetail");
const cameraBadge = document.querySelector("#cameraBadge");
const startButton = document.querySelector("#startButton");
const lockButton = document.querySelector("#lockButton");
const demoButton = document.querySelector("#demoButton");
const resetButton = document.querySelector("#resetButton");
const scaleControl = document.querySelector("#scaleControl");
const xControl = document.querySelector("#xControl");
const yControl = document.querySelector("#yControl");
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
const TARGET_MATCH_THRESHOLD = 0.72;
const TARGET_LOCATED_THRESHOLD = 0.64;

let stream = null;
let scanId = 0;
let confidence = 0;
let locked = false;
let demoMode = false;
let targetsReady = false;
let targetDescriptors = [];
let bestTargetName = "";

const params = new URLSearchParams(window.location.search);
if (params.has("reset")) {
  localStorage.removeItem("euclid-ar-calibration");
}

const savedCalibration = JSON.parse(localStorage.getItem("euclid-ar-calibration") || "null");
const calibration = savedCalibration || { scale: 100, x: 0, y: 0 };

function setBadge(text, mode = "") {
  cameraBadge.textContent = text;
  cameraBadge.dataset.mode = mode;
}

function setScan(title, detail) {
  scanState.textContent = title;
  scanDetail.textContent = detail;
}

function updateCalibration() {
  viewport.style.setProperty("--overlay-scale", calibration.scale);
  viewport.style.setProperty("--overlay-x", calibration.x);
  viewport.style.setProperty("--overlay-y", calibration.y);
  scaleControl.value = calibration.scale;
  xControl.value = calibration.x;
  yControl.value = calibration.y;
  localStorage.setItem("euclid-ar-calibration", JSON.stringify(calibration));
}

function setLocked(value) {
  locked = value;
  app.classList.toggle("is-locked", locked);
  lockButton.textContent = locked ? "Unlock" : "Lock";
  setScan(locked ? "Locked" : "Scanning", locked ? "Euclid overlay active" : "Euclid training target search");
  setBadge(locked ? "Overlay active" : "Scanning", locked ? "active" : "");
}

function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
}

async function startCamera() {
  demoMode = false;
  app.classList.remove("is-demo");
  setBadge("Camera starting");
  setScan(targetsReady ? "Scanning" : "Loading targets", "Euclid training target search");

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
    setLocked(false);
    setBadge("Rear camera");
    startScan();
  } catch (error) {
    console.warn("Camera unavailable", error);
    setBadge("Camera blocked", "warn");
    setScan("Camera unavailable", "Demo mode ready");
    startDemo();
  }
}

function startDemo() {
  demoMode = true;
  stopCamera();
  cancelAnimationFrame(scanId);
  app.classList.add("is-demo");
  setLocked(true);
  setBadge("Demo mode", "active");
}

function resetExperience() {
  confidence = 0;
  calibration.scale = 100;
  calibration.x = 0;
  calibration.y = 0;
  updateCalibration();
  setLocked(false);

  if (demoMode) {
    app.classList.remove("is-demo");
    demoMode = false;
    setBadge("Ready");
    setScan("Scanning", "Euclid training target search");
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

function scoreCameraFrame() {
  if (!video.videoWidth || !video.videoHeight) return { score: 0, name: "" };

  drawSourceCover(ctx, video, canvas.width, canvas.height);
  const descriptor = createDescriptor(ctx.getImageData(0, 0, canvas.width, canvas.height), canvas.width, canvas.height);
  return findBestTargetMatch(descriptor);
}

function startScan() {
  cancelAnimationFrame(scanId);

  const tick = () => {
    if (!stream || locked) return;

    if (!targetsReady) {
      setScan("Loading targets", "Preparing Euclid training images");
      scanId = requestAnimationFrame(tick);
      return;
    }

    const match = scoreCameraFrame();
    confidence = confidence * 0.84 + match.score * 0.16;
    bestTargetName = match.name;

    if (confidence > TARGET_LOCATED_THRESHOLD) {
      setScan("Euclid located", `${bestTargetName} match ${Math.round(confidence * 100)}%`);
    } else {
      setScan("Scanning", "Euclid training target search");
    }

    if (confidence > TARGET_MATCH_THRESHOLD) {
      setLocked(true);
      return;
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
  setScan("Loading targets", "Preparing Euclid training images");
  const results = await Promise.allSettled(TARGET_IMAGE_URLS.map(buildTargetDescriptor));
  targetDescriptors = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  targetsReady = targetDescriptors.length > 0;
  document.documentElement.dataset.euclidTargets = String(targetDescriptors.length);

  if (targetsReady) {
    if (!demoMode && !locked && !stream) {
      setBadge(`${targetDescriptors.length} targets`);
      setScan("Ready", "Training target scan prepared");
    }
  } else {
    setBadge("No targets", "warn");
    setScan("Targets unavailable", "Use Demo or Lock manually");
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

startButton.addEventListener("click", startCamera);
demoButton.addEventListener("click", startDemo);
resetButton.addEventListener("click", resetExperience);

lockButton.addEventListener("click", () => {
  setLocked(!locked);
  if (!locked && stream) startScan();
});

scaleControl.addEventListener("input", (event) => {
  calibration.scale = Number(event.target.value);
  updateCalibration();
});

xControl.addEventListener("input", (event) => {
  calibration.x = Number(event.target.value);
  updateCalibration();
});

yControl.addEventListener("input", (event) => {
  calibration.y = Number(event.target.value);
  updateCalibration();
});

viewport.addEventListener("pointerdown", (event) => {
  if (!locked || event.target.closest("button, input, label")) return;

  const rect = viewport.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width - 0.5) * 28;
  const y = ((event.clientY - rect.top) / rect.height - 0.5) * 28;

  calibration.x = Math.round(Math.max(-18, Math.min(18, x)));
  calibration.y = Math.round(Math.max(-18, Math.min(18, y)));
  updateCalibration();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(scanId);
  } else if (stream && !locked) {
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
setBadge("Ready");
loadTrainingTargets();

if (params.has("demo")) {
  startDemo();
} else if (params.has("lock")) {
  setLocked(true);
}
