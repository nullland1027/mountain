const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

const massSlider = document.getElementById("mass");
const volumeSlider = document.getElementById("volume");
const heightSlider = document.getElementById("height");
const gridSlider = document.getElementById("gridSize");
const resetButton = document.getElementById("reset");

const massValue = document.getElementById("massValue");
const volumeValue = document.getElementById("volumeValue");
const heightValue = document.getElementById("heightValue");
const gridValue = document.getElementById("gridSizeValue");
const gridMeta = document.getElementById("gridMeta");

const CELL_METERS = 10000; // 10 km per cell
const VERTICAL_EXAGGERATION = 1;
const METERS_TO_UNITS = 1 / CELL_METERS;
const Z_SCALE = METERS_TO_UNITS * VERTICAL_EXAGGERATION;
const WATER_DEPTH = 20000;
const SEABED_THICKNESS = 4000;
const RENDER_Z_OFFSET = WATER_DEPTH;
const WATER_SURFACE_HUE = 196;
const WATER_SURFACE_SAT = 62;
const WATER_SURFACE_ALPHA = 0.55;
const WATER_SIDE_ALPHA = 0.35;
const SEABED_TOP_COLOR = "#4b3a2d";
const SEABED_RIGHT_COLOR = "#3a2a1f";
const SEABED_FRONT_COLOR = "#2f2218";
const SEABED_LEFT_COLOR = "#544031";
const SEABED_BACK_COLOR = "#3a2d23";

const G = 6.674e-11;
const WAVE_SPEED = 80; // m/s
const DAMPING = 0.02;
const FIXED_DT = 0.035;
const FOV = (50 * Math.PI) / 180;

let centerX = 0;
let centerY = 0;
let canvasWidth = 0;
let canvasHeight = 0;
let focalLength = 600;

let gridSize = parseInt(gridSlider.value, 10);
let gridHalf = gridSize / 2;
let nodeSize = gridSize + 1;
let nodeCount = nodeSize * nodeSize;

const camera = {
  yaw: Math.PI * 0.72,
  pitch: 0.55,
  distance: 72,
  minPitch: 0.2,
  maxPitch: 1.25,
  minDistance: 28,
  maxDistance: 160,
  targetX: 0,
  targetY: 0,
  targetZ: RENDER_Z_OFFSET * Z_SCALE,
};

let camX = 0;
let camY = 0;
let camZ = 0;
let rightX = 0;
let rightY = 0;
let rightZ = 0;
let upX = 0;
let upY = 0;
let upZ = 0;
let forwardX = 0;
let forwardY = 0;
let forwardZ = 0;

let heightField = new Float32Array(gridSize * gridSize);
let velocityField = new Float32Array(gridSize * gridSize);
let nextHeight = new Float32Array(gridSize * gridSize);
let gravityZ = new Float32Array(gridSize * gridSize);
let surfaceNodes = new Float32Array(nodeCount);
let nodeScreenX = new Float32Array(nodeCount);
let nodeScreenY = new Float32Array(nodeCount);
let nodeDepth = new Float32Array(nodeCount);
let cellOrder = Array.from({ length: gridSize * gridSize }, (_, i) => i);
let cellDepth = new Float32Array(gridSize * gridSize);

const state = {
  massExp: parseFloat(massSlider.value),
  volumeExp: parseFloat(volumeSlider.value),
  heightKm: parseFloat(heightSlider.value),
};

function index(x, y) {
  return x + y * gridSize;
}

function nodeIndex(x, y) {
  return x + y * nodeSize;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatExp(value) {
  const exp = value.toExponential(2).split("e");
  const mantissa = parseFloat(exp[0]).toFixed(2);
  const power = exp[1].replace("+", "");
  return `${mantissa}×10^${power}`;
}

function updateLabels() {
  const massKg = Math.pow(10, state.massExp);
  const volumeKm3 = Math.pow(10, state.volumeExp);
  const volumeM3 = volumeKm3 * 1e9;
  const radiusMeters = Math.cbrt((3 * volumeM3) / (4 * Math.PI));

  massValue.textContent = `${formatExp(massKg)} kg`;
  volumeValue.textContent = `${formatExp(volumeKm3)} km^3  ·  半径 ${(
    radiusMeters / 1000
  ).toFixed(1)} km`;
  const clearanceKm = state.heightKm;
  const centerKm = (clearanceKm * 1000 + radiusMeters) / 1000;
  heightValue.textContent = `${clearanceKm.toFixed(0)} km · 球心 ${centerKm.toFixed(0)} km`;

  return {
    massKg,
    radiusMeters,
    heightMeters: clearanceKm * 1000 + radiusMeters,
  };
}

function updateGridLabels() {
  const label = `${gridSize}×${gridSize}`;
  if (gridValue) {
    gridValue.textContent = label;
  }
  if (gridMeta) {
    gridMeta.textContent = label;
  }
}

function updateFromUI() {
  state.massExp = parseFloat(massSlider.value);
  state.volumeExp = parseFloat(volumeSlider.value);
  state.heightKm = parseFloat(heightSlider.value);
}

function handleGridChange() {
  const newSize = parseInt(gridSlider.value, 10);
  if (!Number.isFinite(newSize) || newSize === gridSize) {
    updateGridLabels();
    return;
  }
  setupGrid(newSize);
}

function updateCameraLimits() {
  const base = gridSize;
  camera.minDistance = Math.max(18, base * 0.8);
  camera.maxDistance = Math.max(120, base * 4);
  camera.distance = clamp(camera.distance, camera.minDistance, camera.maxDistance);
}

function setupGrid(newSize) {
  gridSize = newSize;
  gridHalf = gridSize / 2;
  nodeSize = gridSize + 1;
  nodeCount = nodeSize * nodeSize;

  heightField = new Float32Array(gridSize * gridSize);
  velocityField = new Float32Array(gridSize * gridSize);
  nextHeight = new Float32Array(gridSize * gridSize);
  gravityZ = new Float32Array(gridSize * gridSize);
  surfaceNodes = new Float32Array(nodeCount);
  nodeScreenX = new Float32Array(nodeCount);
  nodeScreenY = new Float32Array(nodeCount);
  nodeDepth = new Float32Array(nodeCount);
  cellOrder = Array.from({ length: gridSize * gridSize }, (_, i) => i);
  cellDepth = new Float32Array(gridSize * gridSize);

  updateCameraLimits();
  updateGridLabels();
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvasWidth = rect.width;
  canvasHeight = rect.height;
  focalLength = 0.92 * Math.min(rect.width, rect.height) / Math.tan(FOV / 2);
  centerX = rect.width * 0.5;
  centerY = rect.height * 0.58;
}

function updateCameraBasis() {
  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);

  camX = camera.targetX + camera.distance * cosPitch * cosYaw;
  camY = camera.targetY + camera.distance * cosPitch * sinYaw;
  camZ = camera.targetZ + camera.distance * sinPitch;

  const fx = camera.targetX - camX;
  const fy = camera.targetY - camY;
  const fz = camera.targetZ - camZ;
  const fLen = Math.hypot(fx, fy, fz) || 1;
  forwardX = fx / fLen;
  forwardY = fy / fLen;
  forwardZ = fz / fLen;

  rightX = forwardY;
  rightY = -forwardX;
  rightZ = 0;
  const rLen = Math.hypot(rightX, rightY) || 1;
  rightX /= rLen;
  rightY /= rLen;

  upX = rightY * forwardZ - rightZ * forwardY;
  upY = rightZ * forwardX - rightX * forwardZ;
  upZ = rightX * forwardY - rightY * forwardX;
}

function projectWorld(xUnits, yUnits, zUnits) {
  const dx = xUnits - camX;
  const dy = yUnits - camY;
  const dz = zUnits - camZ;

  const cx = dx * rightX + dy * rightY + dz * rightZ;
  const cy = dx * upX + dy * upY + dz * upZ;
  const cz = Math.max(0.05, dx * forwardX + dy * forwardY + dz * forwardZ);
  const scale = focalLength / cz;

  return {
    x: centerX + cx * scale,
    y: centerY - cy * scale,
    depth: cz,
  };
}

function projectWorldToArrays(xUnits, yUnits, zUnits, idx) {
  const dx = xUnits - camX;
  const dy = yUnits - camY;
  const dz = zUnits - camZ;

  const cx = dx * rightX + dy * rightY + dz * rightZ;
  const cy = dx * upX + dy * upY + dz * upZ;
  const cz = Math.max(0.05, dx * forwardX + dy * forwardY + dz * forwardZ);
  const scale = focalLength / cz;

  nodeScreenX[idx] = centerX + cx * scale;
  nodeScreenY[idx] = centerY - cy * scale;
  nodeDepth[idx] = cz;
}

function buildSurfaceNodes() {
  for (let y = 0; y <= gridSize; y += 1) {
    for (let x = 0; x <= gridSize; x += 1) {
      let sum = 0;
      let count = 0;

      if (x > 0 && y > 0) {
        sum += heightField[index(x - 1, y - 1)];
        count += 1;
      }
      if (x < gridSize && y > 0) {
        sum += heightField[index(x, y - 1)];
        count += 1;
      }
      if (x > 0 && y < gridSize) {
        sum += heightField[index(x - 1, y)];
        count += 1;
      }
      if (x < gridSize && y < gridSize) {
        sum += heightField[index(x, y)];
        count += 1;
      }

      surfaceNodes[nodeIndex(x, y)] = count ? sum / count : 0;
    }
  }
}

function projectSurfaceNodes() {
  for (let y = 0; y <= gridSize; y += 1) {
    for (let x = 0; x <= gridSize; x += 1) {
      const idx = nodeIndex(x, y);
      const xUnits = x - gridHalf;
      const yUnits = y - gridHalf;
      const zUnits = (surfaceNodes[idx] + RENDER_Z_OFFSET) * Z_SCALE;
      projectWorldToArrays(xUnits, yUnits, zUnits, idx);
    }
  }
}

function computeGravity(params) {
  const { massKg, radiusMeters, heightMeters } = params;
  const radiusCubed = radiusMeters * radiusMeters * radiusMeters;

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const idx = index(x, y);
      const xUnits = x - gridHalf + 0.5;
      const yUnits = y - gridHalf + 0.5;
      const dx = xUnits * CELL_METERS;
      const dy = yUnits * CELL_METERS;
      const dz = heightMeters - heightField[idx];
      const r2 = dx * dx + dy * dy + dz * dz;
      const r = Math.sqrt(r2) + 1e-6;

      let factor;
      if (r < radiusMeters) {
        factor = G * massKg / radiusCubed;
      } else {
        factor = G * massKg / (r2 * r);
      }

      gravityZ[idx] = factor * dz;
    }
  }
}

function stepSimulation(params) {
  computeGravity(params);

  const waveSpeed2 = WAVE_SPEED * WAVE_SPEED;
  let sum = 0;

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const idx = index(x, y);
      const h = heightField[idx];

      const left = x > 0 ? heightField[index(x - 1, y)] : h;
      const right = x < gridSize - 1 ? heightField[index(x + 1, y)] : h;
      const up = y > 0 ? heightField[index(x, y - 1)] : h;
      const down = y < gridSize - 1 ? heightField[index(x, y + 1)] : h;

      const laplacian =
        (left + right + up + down - 4 * h) / (CELL_METERS * CELL_METERS);
      const acceleration = waveSpeed2 * laplacian + gravityZ[idx];

      let v = velocityField[idx];
      v += acceleration * FIXED_DT;
      v *= 1 - DAMPING;

      let next = h + v * FIXED_DT;

      if (x < 2 || y < 2 || x > gridSize - 3 || y > gridSize - 3) {
        v *= 0.65;
        next *= 0.98;
      }

      velocityField[idx] = v;
      nextHeight[idx] = next;
      sum += next;
    }
  }

  const mean = sum / heightField.length;
  for (let i = 0; i < heightField.length; i += 1) {
    heightField[i] = nextHeight[i] - mean;
  }
}

function drawQuad(x0, y0, x1, y1, x2, y2, x3, y3, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

function drawTriangleByIndex(i0, i1, i2) {
  ctx.beginPath();
  ctx.moveTo(nodeScreenX[i0], nodeScreenY[i0]);
  ctx.lineTo(nodeScreenX[i1], nodeScreenY[i1]);
  ctx.lineTo(nodeScreenX[i2], nodeScreenY[i2]);
  ctx.closePath();
  ctx.fill();
}

function collectFace(faces, p0, p1, p2, p3, color) {
  const a = projectWorld(p0[0], p0[1], p0[2]);
  const b = projectWorld(p1[0], p1[1], p1[2]);
  const c = projectWorld(p2[0], p2[1], p2[2]);
  const d = projectWorld(p3[0], p3[1], p3[2]);
  faces.push({
    a,
    b,
    c,
    d,
    color,
    depth: (a.depth + b.depth + c.depth + d.depth) * 0.25,
  });
}

function drawFaces(faces) {
  faces.sort((a, b) => b.depth - a.depth);
  for (const face of faces) {
    drawQuad(
      face.a.x,
      face.a.y,
      face.b.x,
      face.b.y,
      face.c.x,
      face.c.y,
      face.d.x,
      face.d.y,
      face.color
    );
  }
}

function surfaceZUnitsAtNode(x, y) {
  return (surfaceNodes[nodeIndex(x, y)] + RENDER_Z_OFFSET) * Z_SCALE;
}

function collectSeabedFaces(faces) {
  const x0 = -gridHalf;
  const x1 = gridHalf;
  const y0 = -gridHalf;
  const y1 = gridHalf;
  const zTop = 0;
  const zBottom = -SEABED_THICKNESS * Z_SCALE;

  const p0 = [x0, y0, zTop];
  const p1 = [x1, y0, zTop];
  const p2 = [x1, y1, zTop];
  const p3 = [x0, y1, zTop];
  const b0 = [x0, y0, zBottom];
  const b1 = [x1, y0, zBottom];
  const b2 = [x1, y1, zBottom];
  const b3 = [x0, y1, zBottom];

  collectFace(faces, p0, p1, p2, p3, SEABED_TOP_COLOR);
  collectFace(faces, p1, p2, b2, b1, SEABED_RIGHT_COLOR);
  collectFace(faces, p0, p3, b3, b0, SEABED_LEFT_COLOR);
  collectFace(faces, p3, p2, b2, b3, SEABED_FRONT_COLOR);
  collectFace(faces, p0, p1, b1, b0, SEABED_BACK_COLOR);
}

function collectWaterSideFaces(faces) {
  const rightSide = `rgba(110, 195, 225, ${WATER_SIDE_ALPHA})`;
  const leftSide = `rgba(95, 170, 205, ${WATER_SIDE_ALPHA})`;
  const frontSide = `rgba(130, 210, 235, ${WATER_SIDE_ALPHA})`;
  const backSide = `rgba(86, 155, 190, ${WATER_SIDE_ALPHA})`;
  const zBase = 0;

  const xRight = gridHalf;
  const xLeft = -gridHalf;
  for (let y = 0; y < gridSize; y += 1) {
    const yUnits0 = y - gridHalf;
    const yUnits1 = y + 1 - gridHalf;
    const z0 = surfaceZUnitsAtNode(gridSize, y);
    const z1 = surfaceZUnitsAtNode(gridSize, y + 1);
    const zl0 = surfaceZUnitsAtNode(0, y);
    const zl1 = surfaceZUnitsAtNode(0, y + 1);

    collectFace(
      faces,
      [xRight, yUnits0, zBase],
      [xRight, yUnits1, zBase],
      [xRight, yUnits1, z1],
      [xRight, yUnits0, z0],
      rightSide
    );

    collectFace(
      faces,
      [xLeft, yUnits1, zBase],
      [xLeft, yUnits0, zBase],
      [xLeft, yUnits0, zl0],
      [xLeft, yUnits1, zl1],
      leftSide
    );
  }

  const yFront = gridHalf;
  const yBack = -gridHalf;
  for (let x = 0; x < gridSize; x += 1) {
    const xUnits0 = x - gridHalf;
    const xUnits1 = x + 1 - gridHalf;
    const z0 = surfaceZUnitsAtNode(x, gridSize);
    const z1 = surfaceZUnitsAtNode(x + 1, gridSize);
    const zb0 = surfaceZUnitsAtNode(x, 0);
    const zb1 = surfaceZUnitsAtNode(x + 1, 0);

    collectFace(
      faces,
      [xUnits0, yFront, zBase],
      [xUnits1, yFront, zBase],
      [xUnits1, yFront, z1],
      [xUnits0, yFront, z0],
      frontSide
    );

    collectFace(
      faces,
      [xUnits1, yBack, zBase],
      [xUnits0, yBack, zBase],
      [xUnits0, yBack, zb0],
      [xUnits1, yBack, zb1],
      backSide
    );
  }
}

function drawSurfaceOutline() {
  ctx.strokeStyle = "rgba(180, 230, 245, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = 0; x <= gridSize; x += 1) {
    const idx = nodeIndex(x, 0);
    if (x === 0) {
      ctx.moveTo(nodeScreenX[idx], nodeScreenY[idx]);
    } else {
      ctx.lineTo(nodeScreenX[idx], nodeScreenY[idx]);
    }
  }

  for (let y = 1; y <= gridSize; y += 1) {
    const idx = nodeIndex(gridSize, y);
    ctx.lineTo(nodeScreenX[idx], nodeScreenY[idx]);
  }

  for (let x = gridSize - 1; x >= 0; x -= 1) {
    const idx = nodeIndex(x, gridSize);
    ctx.lineTo(nodeScreenX[idx], nodeScreenY[idx]);
  }

  for (let y = gridSize - 1; y >= 1; y -= 1) {
    const idx = nodeIndex(0, y);
    ctx.lineTo(nodeScreenX[idx], nodeScreenY[idx]);
  }

  ctx.closePath();
  ctx.stroke();
}

function prepareSurfaceOrder() {
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const idx = index(x, y);
      const i00 = nodeIndex(x, y);
      const i10 = nodeIndex(x + 1, y);
      const i11 = nodeIndex(x + 1, y + 1);
      const i01 = nodeIndex(x, y + 1);
      cellDepth[idx] =
        (nodeDepth[i00] + nodeDepth[i10] + nodeDepth[i11] + nodeDepth[i01]) * 0.25;
    }
  }

  cellOrder.sort((a, b) => cellDepth[b] - cellDepth[a]);
}

function drawWaterSurface(sphereDepth, drawSphere) {
  let sphereDrawn = false;

  for (let i = 0; i < cellOrder.length; i += 1) {
    const idx = cellOrder[i];

    if (!sphereDrawn && sphereDepth !== null && cellDepth[idx] <= sphereDepth) {
      drawSphere();
      sphereDrawn = true;
    }

    const x = idx % gridSize;
    const y = (idx - x) / gridSize;

    const i00 = nodeIndex(x, y);
    const i10 = nodeIndex(x + 1, y);
    const i11 = nodeIndex(x + 1, y + 1);
    const i01 = nodeIndex(x, y + 1);

    const averageHeight =
      (surfaceNodes[i00] + surfaceNodes[i10] + surfaceNodes[i11] + surfaceNodes[i01]) *
      0.25;
    const depthShade = Math.min(1, cellDepth[idx] / (camera.distance * 1.8));
    const lightness = clamp(66 + averageHeight * 0.015 - depthShade * 10, 50, 74);

    ctx.fillStyle = `hsla(${WATER_SURFACE_HUE}, ${WATER_SURFACE_SAT}%, ${lightness}%, ${WATER_SURFACE_ALPHA})`;
    drawTriangleByIndex(i00, i10, i11);
    drawTriangleByIndex(i00, i11, i01);
  }

  if (!sphereDrawn && drawSphere) {
    drawSphere();
  }
}

function renderScene(params) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const { radiusMeters, heightMeters } = params;

  updateCameraBasis();
  buildSurfaceNodes();
  projectSurfaceNodes();
  prepareSurfaceOrder();

  const seabedFaces = [];
  const waterFaces = [];
  collectSeabedFaces(seabedFaces);
  collectWaterSideFaces(waterFaces);
  drawFaces(seabedFaces);
  drawFaces(waterFaces);

  const sphereZ = (heightMeters + RENDER_Z_OFFSET) * Z_SCALE;
  const sphereRadiusUnits = radiusMeters * METERS_TO_UNITS;
  const sphereCenter = projectWorld(0, 0, sphereZ);
  const sphereDepth = sphereCenter.depth - sphereRadiusUnits;
  const radiusPx = (focalLength * sphereRadiusUnits) / sphereCenter.depth;

  const drawSphere = () => {
    const gradient = ctx.createRadialGradient(
      sphereCenter.x - radiusPx * 0.3,
      sphereCenter.y - radiusPx * 0.4,
      radiusPx * 0.3,
      sphereCenter.x,
      sphereCenter.y,
      radiusPx
    );
    gradient.addColorStop(0, "rgb(255, 224, 190)");
    gradient.addColorStop(0.6, "rgb(230, 160, 88)");
    gradient.addColorStop(1, "rgb(120, 66, 28)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sphereCenter.x, sphereCenter.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(120, 66, 28, 0.65)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(sphereCenter.x, sphereCenter.y, radiusPx, 0, Math.PI * 2);
    ctx.stroke();
  };

  drawWaterSurface(sphereDepth, drawSphere);
  drawSurfaceOutline();
}

let isDragging = false;
let lastPointerX = 0;
let lastPointerY = 0;

function handlePointerDown(event) {
  isDragging = true;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!isDragging) {
    return;
  }
  const dx = event.clientX - lastPointerX;
  const dy = event.clientY - lastPointerY;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;

  camera.yaw -= dx * 0.006;
  camera.pitch = clamp(camera.pitch + dy * 0.006, camera.minPitch, camera.maxPitch);
}

function handlePointerUp(event) {
  if (!isDragging) {
    return;
  }
  isDragging = false;
  canvas.releasePointerCapture(event.pointerId);
}

function handleWheel(event) {
  event.preventDefault();
  const zoom = Math.exp(event.deltaY * 0.0012);
  camera.distance = clamp(camera.distance * zoom, camera.minDistance, camera.maxDistance);
}

function resetSurface() {
  heightField.fill(0);
  velocityField.fill(0);
  nextHeight.fill(0);
}

let lastTime = performance.now();
let accumulator = 0;

function animate(now) {
  const delta = (now - lastTime) / 1000;
  lastTime = now;
  accumulator += delta;

  updateFromUI();
  const params = updateLabels();

  while (accumulator >= FIXED_DT) {
    stepSimulation(params);
    accumulator -= FIXED_DT;
  }

  renderScene(params);
  requestAnimationFrame(animate);
}

massSlider.addEventListener("input", updateFromUI);
volumeSlider.addEventListener("input", updateFromUI);
heightSlider.addEventListener("input", updateFromUI);
gridSlider.addEventListener("input", handleGridChange);
resetButton.addEventListener("click", resetSurface);
window.addEventListener("resize", resize);
canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointerleave", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerUp);
canvas.addEventListener("wheel", handleWheel, { passive: false });

setupGrid(gridSize);
resize();
updateFromUI();
updateLabels();
requestAnimationFrame(animate);
