const state = {
  image: null,
  fileBaseName: "grid-image",
  rows: 3,
  cols: 3,
  hLines: [],
  vLines: [],
  activeAxis: "h",
  selectedLine: null,
  selectedPiece: 0,
  pieceUrls: [],
};

const els = {
  fileInput: document.querySelector("#fileInput"),
  rowsInput: document.querySelector("#rowsInput"),
  colsInput: document.querySelector("#colsInput"),
  resetLinesButton: document.querySelector("#resetLinesButton"),
  dropZone: document.querySelector("#dropZone"),
  previewWrap: document.querySelector("#previewWrap"),
  previewCanvas: document.querySelector("#previewCanvas"),
  overlay: document.querySelector("#overlay"),
  horizontalTab: document.querySelector("#horizontalTab"),
  verticalTab: document.querySelector("#verticalTab"),
  lineEditor: document.querySelector("#lineEditor"),
  lineHint: document.querySelector("#lineHint"),
  imageMeta: document.querySelector("#imageMeta"),
  piecesGrid: document.querySelector("#piecesGrid"),
  piecesCount: document.querySelector("#piecesCount"),
  downloadZipButton: document.querySelector("#downloadZipButton"),
  downloadSelectedButton: document.querySelector("#downloadSelectedButton"),
};

const previewContext = els.previewCanvas.getContext("2d");

els.fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) loadImageFile(file);
});

els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropZone.classList.add("drag-over");
});

els.dropZone.addEventListener("dragleave", () => {
  els.dropZone.classList.remove("drag-over");
});

els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("drag-over");
  const [file] = event.dataTransfer.files;
  if (file && file.type.startsWith("image/")) loadImageFile(file);
});

els.rowsInput.addEventListener("change", () => {
  state.rows = clampInteger(els.rowsInput.value, 1, 30);
  els.rowsInput.value = state.rows;
  state.hLines = evenLines(state.rows);
  state.selectedLine = null;
  updateAll();
});

els.colsInput.addEventListener("change", () => {
  state.cols = clampInteger(els.colsInput.value, 1, 30);
  els.colsInput.value = state.cols;
  state.vLines = evenLines(state.cols);
  state.selectedLine = null;
  updateAll();
});

els.resetLinesButton.addEventListener("click", () => {
  state.hLines = evenLines(state.rows);
  state.vLines = evenLines(state.cols);
  state.selectedLine = null;
  updateAll();
});

els.horizontalTab.addEventListener("click", () => setActiveAxis("h"));
els.verticalTab.addEventListener("click", () => setActiveAxis("v"));

els.downloadZipButton.addEventListener("click", async () => {
  if (!state.image) return;
  const pieces = await createPieces();
  const files = pieces.map((piece) => ({
    name: piece.filename,
    blob: piece.blob,
  }));
  const zipBlob = await createZip(files);
  triggerDownload(zipBlob, `${state.fileBaseName}-pieces.zip`);
});

els.downloadSelectedButton.addEventListener("click", async () => {
  if (!state.image) return;
  const pieces = await createPieces();
  const piece = pieces[state.selectedPiece] || pieces[0];
  if (piece) triggerDownload(piece.blob, piece.filename);
});

window.addEventListener("resize", () => {
  drawPreview();
  renderOverlay();
});

window.addEventListener("keydown", (event) => {
  if (!state.image || !state.selectedLine) return;
  const isHorizontal = state.selectedLine.axis === "h";
  const negativeKey = isHorizontal ? "ArrowUp" : "ArrowLeft";
  const positiveKey = isHorizontal ? "ArrowDown" : "ArrowRight";
  if (event.key !== negativeKey && event.key !== positiveKey) return;

  event.preventDefault();
  const dimension = isHorizontal ? state.image.naturalHeight : state.image.naturalWidth;
  const step = event.shiftKey ? 10 : 1;
  const delta = (event.key === negativeKey ? -step : step) / dimension;
  moveLine(state.selectedLine.axis, state.selectedLine.index, getLineValue(state.selectedLine) + delta);
});

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      state.image = image;
      state.fileBaseName = sanitizeName(file.name.replace(/\.[^.]+$/, "")) || "grid-image";
      state.selectedPiece = 0;
      if (!state.hLines.length) state.hLines = evenLines(state.rows);
      if (!state.vLines.length) state.vLines = evenLines(state.cols);
      els.previewWrap.hidden = false;
      els.dropZone.querySelector(".empty-state").hidden = true;
      updateAll();
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function updateAll() {
  drawPreview();
  renderOverlay();
  renderLineEditor();
  renderPieces();
  updateMeta();
}

function drawPreview() {
  if (!state.image) return;
  const maxWidth = els.dropZone.clientWidth - 32;
  const maxHeight = els.dropZone.clientHeight - 32;
  const scale = Math.min(maxWidth / state.image.naturalWidth, maxHeight / state.image.naturalHeight, 1);
  const width = Math.max(1, Math.round(state.image.naturalWidth * scale));
  const height = Math.max(1, Math.round(state.image.naturalHeight * scale));

  els.previewCanvas.width = width;
  els.previewCanvas.height = height;
  els.previewCanvas.style.width = `${width}px`;
  els.previewCanvas.style.height = `${height}px`;
  els.overlay.style.width = `${width}px`;
  els.overlay.style.height = `${height}px`;

  previewContext.clearRect(0, 0, width, height);
  previewContext.drawImage(state.image, 0, 0, width, height);
}

function renderOverlay() {
  els.overlay.replaceChildren();
  if (!state.image) return;

  state.hLines.forEach((value, index) => {
    els.overlay.appendChild(createLineHandle("h", index, value));
  });
  state.vLines.forEach((value, index) => {
    els.overlay.appendChild(createLineHandle("v", index, value));
  });
}

function createLineHandle(axis, index, value) {
  const line = document.createElement("button");
  line.type = "button";
  line.className = `grid-line ${axis === "h" ? "horizontal" : "vertical"}`;
  line.setAttribute("aria-label", `${axis === "h" ? "가로" : "세로"} 분할선 ${index + 1}`);
  if (state.selectedLine?.axis === axis && state.selectedLine?.index === index) {
    line.classList.add("selected");
  }
  if (axis === "h") {
    line.style.top = `${value * 100}%`;
  } else {
    line.style.left = `${value * 100}%`;
  }

  line.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    state.selectedLine = { axis, index };
    renderOverlay();
    renderLineEditor();

    const onMove = (moveEvent) => {
      const rect = els.overlay.getBoundingClientRect();
      const next = axis === "h"
        ? (moveEvent.clientY - rect.top) / rect.height
        : (moveEvent.clientX - rect.left) / rect.width;
      moveLine(axis, index, next, { skipPieces: true, skipEditor: true });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      renderLineEditor();
      renderPieces();
      updateMeta();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  });

  return line;
}

function renderLineEditor() {
  els.horizontalTab.classList.toggle("active", state.activeAxis === "h");
  els.verticalTab.classList.toggle("active", state.activeAxis === "v");
  els.lineEditor.replaceChildren();

  const lines = state.activeAxis === "h" ? state.hLines : state.vLines;
  const dimension = getActiveDimension();
  els.lineHint.textContent = lines.length
    ? "분할선을 마우스로 드래그하거나 값을 입력해 조정하세요. 선택한 선은 방향키로 1px, Shift+방향키로 10px 이동합니다."
    : "현재 방향에는 내부 분할선이 없습니다.";

  lines.forEach((value, index) => {
    const row = document.createElement("div");
    row.className = "line-row";
    if (state.selectedLine?.axis === state.activeAxis && state.selectedLine?.index === index) {
      row.classList.add("selected");
    }

    const label = document.createElement("button");
    label.type = "button";
    label.className = "line-name";
    label.textContent = `${state.activeAxis === "h" ? "가로" : "세로"} ${index + 1}`;
    label.addEventListener("click", () => {
      state.selectedLine = { axis: state.activeAxis, index };
      renderLineEditor();
      renderOverlay();
    });

    const number = document.createElement("input");
    number.type = "number";
    number.min = 0;
    number.max = dimension;
    number.step = 1;
    number.value = Math.round(value * dimension);
    number.addEventListener("change", () => {
      state.selectedLine = { axis: state.activeAxis, index };
      moveLine(state.activeAxis, index, Number(number.value) / dimension);
    });

    row.append(label, number);
    els.lineEditor.appendChild(row);
  });
}

function renderPieces() {
  els.piecesGrid.replaceChildren();
  revokePieceUrls();
  if (!state.image) {
    els.piecesCount.textContent = "0개";
    return;
  }

  const boxes = getCropBoxes();
  els.piecesCount.textContent = `${boxes.length}개`;
  boxes.forEach((box, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = box.width;
    canvas.height = box.height;
    canvas.getContext("2d").drawImage(
      state.image,
      box.x,
      box.y,
      box.width,
      box.height,
      0,
      0,
      box.width,
      box.height,
    );

    const dataUrl = canvas.toDataURL("image/png");
    state.pieceUrls.push(dataUrl);

    const piece = document.createElement("article");
    piece.className = "piece";
    if (index === state.selectedPiece) piece.classList.add("selected");

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "piece-preview";
    selectButton.addEventListener("click", () => {
      state.selectedPiece = index;
      renderPieces();
      updateDownloadButtons();
    });

    const img = document.createElement("img");
    img.alt = `조각 ${box.row + 1}-${box.col + 1}`;
    img.src = dataUrl;
    selectButton.appendChild(img);

    const footer = document.createElement("div");
    footer.className = "piece-footer";
    footer.innerHTML = `<span><strong>${box.row + 1}-${box.col + 1}</strong> ${box.width}x${box.height}</span>`;

    const download = document.createElement("button");
    download.type = "button";
    download.className = "piece-download";
    download.textContent = "저장";
    download.addEventListener("click", async () => {
      const blob = await canvasToBlob(canvas);
      triggerDownload(blob, pieceFilename(box));
    });

    footer.appendChild(download);
    piece.append(selectButton, footer);
    els.piecesGrid.appendChild(piece);
  });
}

function updateMeta() {
  if (!state.image) {
    els.imageMeta.textContent = "이미지를 선택하면 원본 크기와 조각 수가 표시됩니다.";
  } else {
    const count = state.rows * state.cols;
    els.imageMeta.textContent = `원본 ${state.image.naturalWidth}x${state.image.naturalHeight}px · ${state.rows}행 x ${state.cols}열 · ${count}개 조각`;
  }
  updateDownloadButtons();
}

function updateDownloadButtons() {
  const enabled = Boolean(state.image);
  els.downloadZipButton.disabled = !enabled;
  els.downloadSelectedButton.disabled = !enabled;
}

async function createPieces() {
  const boxes = getCropBoxes();
  const pieces = [];
  for (const box of boxes) {
    const canvas = document.createElement("canvas");
    canvas.width = box.width;
    canvas.height = box.height;
    canvas.getContext("2d").drawImage(
      state.image,
      box.x,
      box.y,
      box.width,
      box.height,
      0,
      0,
      box.width,
      box.height,
    );
    pieces.push({
      box,
      filename: pieceFilename(box),
      blob: await canvasToBlob(canvas),
    });
  }
  return pieces;
}

function getCropBoxes() {
  if (!state.image) return [];
  const xs = [0, ...state.vLines, 1].map((value) => Math.round(value * state.image.naturalWidth));
  const ys = [0, ...state.hLines, 1].map((value) => Math.round(value * state.image.naturalHeight));
  const boxes = [];

  for (let row = 0; row < ys.length - 1; row += 1) {
    for (let col = 0; col < xs.length - 1; col += 1) {
      const x = xs[col];
      const y = ys[row];
      boxes.push({
        row,
        col,
        x,
        y,
        width: Math.max(1, xs[col + 1] - x),
        height: Math.max(1, ys[row + 1] - y),
      });
    }
  }
  return boxes;
}

function moveLine(axis, index, rawValue, options = {}) {
  const lines = axis === "h" ? state.hLines : state.vLines;
  const dimension = axis === "h" ? state.image.naturalHeight : state.image.naturalWidth;
  const minGap = Math.max(1 / dimension, 0.0001);
  const prev = index === 0 ? 0 : lines[index - 1];
  const next = index === lines.length - 1 ? 1 : lines[index + 1];
  lines[index] = clamp(rawValue, prev + minGap, next - minGap);
  state.selectedLine = { axis, index };

  renderOverlay();
  if (!options.skipEditor) renderLineEditor();
  if (!options.skipPieces) {
    renderPieces();
    updateMeta();
  }
}

function setActiveAxis(axis) {
  state.activeAxis = axis;
  state.selectedLine = null;
  renderLineEditor();
  renderOverlay();
}

function getLineValue(selection) {
  const lines = selection.axis === "h" ? state.hLines : state.vLines;
  return lines[selection.index];
}

function getActiveDimension() {
  if (!state.image) return 100;
  return state.activeAxis === "h" ? state.image.naturalHeight : state.image.naturalWidth;
}

function evenLines(count) {
  return Array.from({ length: Math.max(0, count - 1) }, (_, index) => (index + 1) / count);
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : min, min), max);
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pieceFilename(box) {
  const row = String(box.row + 1).padStart(2, "0");
  const col = String(box.col + 1).padStart(2, "0");
  return `${state.fileBaseName}-r${row}-c${col}.png`;
}

function sanitizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function revokePieceUrls() {
  state.pieceUrls.forEach((url) => {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  });
  state.pieceUrls = [];
}

async function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeZipHeader(localView, {
      signature: 0x04034b50,
      crc,
      size: data.length,
      nameLength: nameBytes.length,
    });
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeCentralHeader(centralView, {
      crc,
      size: data.length,
      nameLength: nameBytes.length,
      offset,
    });
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, endRecord], { type: "application/zip" });
}

function writeZipHeader(view, { signature, crc, size, nameLength }) {
  view.setUint32(0, signature, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameLength, true);
  view.setUint16(28, 0, true);
}

function writeCentralHeader(view, { crc, size, nameLength, offset }) {
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
}

function crc32(data) {
  let crc = -1;
  for (let index = 0; index < data.length; index += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[index]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

state.hLines = evenLines(state.rows);
state.vLines = evenLines(state.cols);
renderLineEditor();
