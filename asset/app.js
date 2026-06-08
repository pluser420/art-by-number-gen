/**
 * Paint by Numbers Generator
 * Client-side engine using Canvas API + SVG output
 *
 * Pipeline:
 *  1. Validate & preview uploaded image
 *  2. User selects a grid layout
 *  3. Image is mapped to the fixed 25-color palette (color 25 = white/no-paint)
 *  4. Each cell is assigned the nearest palette color
 *  5. Two SVG files are exported:
 *     - Paint-by-numbers grid (numbered cells + color legend)
 *     - Mosaic preview (solid color blocks)
 */

'use strict';

// ─── Fixed 25-Color Palette ───────────────────────────────────────────────────
// Color 25 = white = "no painting" (leave cell blank)
// PLACEHOLDER values — replace RGB entries with final client-approved values.
// Format: { name, r, g, b }
const PALETTE = [
  { name: 'Deep Red',       r: 180, g:  30, b:  30 },  //  1
  { name: 'Red',            r: 220, g:  50, b:  50 },  //  2
  { name: 'Orange Red',     r: 230, g: 100, b:  40 },  //  3
  { name: 'Orange',         r: 230, g: 150, b:  40 },  //  4
  { name: 'Yellow',         r: 240, g: 220, b:  50 },  //  5
  { name: 'Yellow Green',   r: 180, g: 210, b:  60 },  //  6
  { name: 'Light Green',    r: 100, g: 190, b:  80 },  //  7
  { name: 'Green',          r:  50, g: 150, b:  60 },  //  8
  { name: 'Dark Green',     r:  20, g: 100, b:  40 },  //  9
  { name: 'Teal',           r:  30, g: 140, b: 130 },  // 10
  { name: 'Light Blue',     r:  80, g: 180, b: 220 },  // 11
  { name: 'Sky Blue',       r:  60, g: 140, b: 210 },  // 12
  { name: 'Blue',           r:  40, g:  80, b: 180 },  // 13
  { name: 'Dark Blue',      r:  20, g:  40, b: 130 },  // 14
  { name: 'Violet',         r:  90, g:  40, b: 160 },  // 15
  { name: 'Purple',         r: 140, g:  50, b: 160 },  // 16
  { name: 'Pink',           r: 220, g: 100, b: 160 },  // 17
  { name: 'Light Pink',     r: 240, g: 180, b: 200 },  // 18
  { name: 'Brown',          r: 130, g:  70, b:  30 },  // 19
  { name: 'Tan',            r: 200, g: 160, b: 110 },  // 20
  { name: 'Light Gray',     r: 200, g: 200, b: 200 },  // 21
  { name: 'Gray',           r: 130, g: 130, b: 130 },  // 22
  { name: 'Dark Gray',      r:  70, g:  70, b:  70 },  // 23
  { name: 'Black',          r:  15, g:  15, b:  15 },  // 24
  { name: 'White (no paint)', r: 255, g: 255, b: 255 }, // 25 — leave cell blank
];

// ─── Grid Layout Definitions ──────────────────────────────────────────────────
// Each layout defines how cells are shaped and how many columns/rows fit the page.
// cellW / cellH are the SVG unit dimensions of each cell.
// For non-square shapes the sampling grid cols×rows may differ from visual cols×rows.
const GRID_LAYOUTS = {
  squares: {
    label: 'Squares',
    cols: 40, rows: 60,
    cellW: 24, cellH: 24,
    draw: drawSquareCell,
    sample: sampleSquare,
  },
  rectangles: {
    label: 'Rectangles (wide)',
    cols: 40, rows: 60,
    cellW: 32, cellH: 20,
    draw: drawRectCell,
    sample: sampleSquare, // same bounding-box sampling
  },
  hexagons: {
    label: 'Hexagons',
    cols: 30, rows: 35,
    cellW: 40, cellH: 46,
    draw: drawHexCell,
    sample: sampleHex,
  },
  triangles: {
    label: 'Triangles',
    cols: 40, rows: 60,   // each logical cell = 2 triangles (up + down)
    cellW: 24, cellH: 24,
    draw: drawTriangleCell,
    sample: sampleTriangle,
  },
  circles: {
    label: 'Circles',
    cols: 30, rows: 40,
    cellW: 32, cellH: 32,
    draw: drawCircleCell,
    sample: sampleSquare,
  },
  diamonds: {
    label: 'Diamonds',
    cols: 40, rows: 60,
    cellW: 28, cellH: 20,
    draw: drawDiamondCell,
    sample: sampleSquare,
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MIN_IMG_WIDTH  = 40;
const MIN_IMG_HEIGHT = 60;
const LEGEND_COLS    = 5;

// Grid detail scale factors removed — grid is now controlled by direct cols/rows inputs

// ─── State ────────────────────────────────────────────────────────────────────
let currentFile      = null;
let currentImg       = null;
let currentBaseName  = 'image';
let selectedLayout   = 'squares';
let customCols       = 40;
let customRows       = 60;
// Set of enabled palette indices (0-based). All enabled by default.
let enabledColors    = new Set(PALETTE.map((_, i) => i));

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const fileInput        = document.getElementById('fileInput');
const dropZone         = document.getElementById('dropZone');
const previewPanel     = document.getElementById('previewPanel');
const previewImg       = document.getElementById('previewImg');
const previewFilename  = document.getElementById('previewFilename');
const previewDims      = document.getElementById('previewDims');
const clearBtn         = document.getElementById('clearBtn');
const errorBanner      = document.getElementById('errorBanner');
const errorText        = document.getElementById('errorText');
const dismissError     = document.getElementById('dismissError');
const layoutSelect     = document.getElementById('layoutSelect');
const colsInput        = document.getElementById('colsInput');
const rowsInput        = document.getElementById('rowsInput');
const generateBtn      = document.getElementById('generateBtn');
const loadingOverlay   = document.getElementById('loadingOverlay');
const loadingText      = document.getElementById('loadingText');
const resultsSection   = document.getElementById('resultsSection');
const gridPreview      = document.getElementById('gridPreview');
const mosaicPreview    = document.getElementById('mosaicPreview');
const downloadGrid     = document.getElementById('downloadGrid');
const downloadMosaic   = document.getElementById('downloadMosaic');
const colorPalette     = document.getElementById('colorPalette');
const paletteCard      = document.getElementById('paletteCard');
const paletteSelector  = document.getElementById('paletteSelector');
const paletteCount     = document.getElementById('paletteCount');
const selectAllBtn     = document.getElementById('selectAllBtn');
const deselectAllBtn   = document.getElementById('deselectAllBtn');

// ─── Init ─────────────────────────────────────────────────────────────────────

// Build palette selector swatches
function buildPaletteSelector() {
  paletteSelector.innerHTML = '';
  PALETTE.forEach((color, i) => {
    const item = document.createElement('div');
    item.className = 'swatch-item swatch-selectable';
    item.style.background = rgbStr(color);
    item.dataset.light = isLightColor(color) ? 'true' : 'false';
    item.dataset.idx = i;
    if (i === 24) item.style.outline = '1.5px dashed #999';
    item.title = `${i + 1}. ${color.name} — click to edit, right-click to toggle`;
    item.textContent = String(i + 1).padStart(2, '0');
    if (!enabledColors.has(i)) item.classList.add('swatch-disabled');

    // Left-click: open color editor
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      openColorEditor(i, item);
    });

    // Right-click: toggle enable/disable
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      togglePaletteColor(i, item);
    });

    paletteSelector.appendChild(item);
  });
  updatePaletteCount();
}

function togglePaletteColor(idx, el) {
  if (enabledColors.has(idx)) {
    // Keep at least 1 color enabled
    if (enabledColors.size <= 1) return;
    enabledColors.delete(idx);
    el.classList.add('swatch-disabled');
  } else {
    enabledColors.add(idx);
    el.classList.remove('swatch-disabled');
  }
  updatePaletteCount();
}

function updatePaletteCount() {
  paletteCount.textContent = `${enabledColors.size} / ${PALETTE.length}`;
}

selectAllBtn.addEventListener('click', () => {
  PALETTE.forEach((_, i) => enabledColors.add(i));
  paletteSelector.querySelectorAll('.swatch-selectable').forEach(el => el.classList.remove('swatch-disabled'));
  updatePaletteCount();
});

deselectAllBtn.addEventListener('click', () => {
  // Keep only color index 24 (white/no-paint) as a fallback
  enabledColors.clear();
  enabledColors.add(24);
  paletteSelector.querySelectorAll('.swatch-selectable').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    if (idx !== 24) el.classList.add('swatch-disabled');
    else el.classList.remove('swatch-disabled');
  });
  updatePaletteCount();
});

buildPaletteSelector();

// ─── Color Editor ─────────────────────────────────────────────────────────────

const colorEditor        = document.getElementById('colorEditor');
const colorEditorBackdrop = document.getElementById('colorEditorBackdrop');
const editorColorNum     = document.getElementById('editorColorNum');
const editorPreview      = document.getElementById('editorPreview');
const editorColorName    = document.getElementById('editorColorName');
const editorR            = document.getElementById('editorR');
const editorG            = document.getElementById('editorG');
const editorB            = document.getElementById('editorB');
const editorHex          = document.getElementById('editorHex');
const editorApplyBtn     = document.getElementById('editorApplyBtn');
const editorResetBtn     = document.getElementById('editorResetBtn');
const colorEditorClose   = document.getElementById('colorEditorClose');

// Original palette values for reset
const PALETTE_DEFAULTS = PALETTE.map(c => ({ ...c }));

let editingIdx = -1; // which palette index is being edited

function openColorEditor(idx, anchorEl) {
  editingIdx = idx;
  const color = PALETTE[idx];
  editorColorNum.textContent  = `#${idx + 1} — ${color.name}`;
  editorColorName.textContent = color.name;
  editorR.value = color.r;
  editorG.value = color.g;
  editorB.value = color.b;
  editorHex.value = rgbToHex(color.r, color.g, color.b);
  updateEditorPreview();

  // Position popup near the swatch
  colorEditor.style.display = 'block';
  colorEditorBackdrop.style.display = 'block';

  const rect = anchorEl.getBoundingClientRect();
  const popW = 240;
  const popH = colorEditor.offsetHeight;
  let left = rect.left + window.scrollX;
  let top  = rect.bottom + window.scrollY + 6;

  // Keep within viewport
  if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
  if (left < 8) left = 8;
  if (top + popH > window.scrollY + window.innerHeight - 8) {
    top = rect.top + window.scrollY - popH - 6;
  }

  colorEditor.style.left = `${left}px`;
  colorEditor.style.top  = `${top}px`;
}

function closeColorEditor() {
  colorEditor.style.display = 'block'; // keep visible briefly to avoid flicker
  colorEditor.style.display = 'none';
  colorEditorBackdrop.style.display = 'none';
  editingIdx = -1;
}

function updateEditorPreview() {
  const r = clamp255(parseInt(editorR.value, 10));
  const g = clamp255(parseInt(editorG.value, 10));
  const b = clamp255(parseInt(editorB.value, 10));
  editorPreview.style.background = `rgb(${r},${g},${b})`;
  editorHex.value = rgbToHex(r, g, b);
}

function clamp255(v) {
  return isNaN(v) ? 0 : Math.min(255, Math.max(0, Math.round(v)));
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  return null;
}

// RGB inputs → update hex + preview
[editorR, editorG, editorB].forEach(input => {
  input.addEventListener('input', updateEditorPreview);
});

// Hex input → update RGB + preview
editorHex.addEventListener('input', () => {
  const rgb = hexToRgb(editorHex.value);
  if (rgb) {
    editorR.value = rgb.r;
    editorG.value = rgb.g;
    editorB.value = rgb.b;
    editorPreview.style.background = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  }
});

editorApplyBtn.addEventListener('click', () => {
  if (editingIdx < 0) return;
  const r = clamp255(parseInt(editorR.value, 10));
  const g = clamp255(parseInt(editorG.value, 10));
  const b = clamp255(parseInt(editorB.value, 10));
  PALETTE[editingIdx].r = r;
  PALETTE[editingIdx].g = g;
  PALETTE[editingIdx].b = b;

  // Update the swatch in the selector
  const swatchEl = paletteSelector.querySelector(`[data-idx="${editingIdx}"]`);
  if (swatchEl) {
    swatchEl.style.background = `rgb(${r},${g},${b})`;
    swatchEl.dataset.light = isLightColor({ r, g, b }) ? 'true' : 'false';
    // Mark as modified if different from default
    const def = PALETTE_DEFAULTS[editingIdx];
    if (r !== def.r || g !== def.g || b !== def.b) {
      swatchEl.classList.add('swatch-modified');
    } else {
      swatchEl.classList.remove('swatch-modified');
    }
  }
  closeColorEditor();
});

editorResetBtn.addEventListener('click', () => {
  if (editingIdx < 0) return;
  const def = PALETTE_DEFAULTS[editingIdx];
  PALETTE[editingIdx].r = def.r;
  PALETTE[editingIdx].g = def.g;
  PALETTE[editingIdx].b = def.b;

  editorR.value = def.r;
  editorG.value = def.g;
  editorB.value = def.b;
  updateEditorPreview();

  const swatchEl = paletteSelector.querySelector(`[data-idx="${editingIdx}"]`);
  if (swatchEl) {
    swatchEl.style.background = rgbStr(def);
    swatchEl.dataset.light = isLightColor(def) ? 'true' : 'false';
    swatchEl.classList.remove('swatch-modified');
  }
  closeColorEditor();
});

colorEditorClose.addEventListener('click', closeColorEditor);
colorEditorBackdrop.addEventListener('click', closeColorEditor);
Object.entries(GRID_LAYOUTS).forEach(([key, layout]) => {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = layout.label;
  layoutSelect.appendChild(opt);
});

layoutSelect.addEventListener('change', () => {
  selectedLayout = layoutSelect.value;
  // Reset cols/rows to the base defaults for the chosen layout
  const base = GRID_LAYOUTS[selectedLayout];
  colsInput.value = base.cols;
  rowsInput.value = base.rows;
  customCols = base.cols;
  customRows = base.rows;
  updatePixelInfo();
});

// ─── Grid size number inputs ──────────────────────────────────────────────────

function clampGridValue(val, min, max) {
  return Math.min(max, Math.max(min, Math.round(val)));
}

function updatePixelInfo() {
  // no-op: col/row values are always visible in the inputs
}

function onGridInputChange(input, isCol) {
  const raw = parseInt(input.value, 10);
  if (isNaN(raw)) return;
  const clamped = clampGridValue(raw, 4, 200);
  input.value = clamped;
  if (isCol) customCols = clamped;
  else customRows = clamped;
  updatePixelInfo();
}

colsInput.addEventListener('input',  () => onGridInputChange(colsInput, true));
colsInput.addEventListener('change', () => onGridInputChange(colsInput, true));
rowsInput.addEventListener('input',  () => onGridInputChange(rowsInput, false));
rowsInput.addEventListener('change', () => onGridInputChange(rowsInput, false));

// ─── Event Wiring ─────────────────────────────────────────────────────────────

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

dropZone.addEventListener('click', (e) => {
  // The <label> already opens the file dialog natively — don't double-trigger
  if (e.target.closest('label')) return;
  fileInput.click();
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

clearBtn.addEventListener('click', clearAll);

dismissError.addEventListener('click', () => {
  errorBanner.style.display = 'none';
});

generateBtn.addEventListener('click', () => {
  if (currentFile && !generateBtn.disabled) runPipeline();
});

downloadGrid.addEventListener('click', () => {
  downloadSVG(gridPreview.querySelector('svg'), `${currentBaseName}_grid.svg`);
});

downloadMosaic.addEventListener('click', () => {
  downloadSVG(mosaicPreview.querySelector('svg'), `${currentBaseName}_mosaic.svg`);
});

// ─── File Handling ────────────────────────────────────────────────────────────

function handleFile(file) {
  hideError();

  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    showError('Only JPG and PNG files are supported.');
    return;
  }

  if (file.size > MAX_FILE_BYTES) {
    showError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 20 MB.`);
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => showError('Could not read the file. It may be corrupt or invalid.');
  reader.onload = (e) => {
    const img = new Image();
    img.onerror = () => showError('Could not decode the image. Make sure it is a valid JPG or PNG.');
    img.onload = () => {
      if (img.naturalWidth < MIN_IMG_WIDTH || img.naturalHeight < MIN_IMG_HEIGHT) {
        showError(
          `Image is too small (${img.naturalWidth}×${img.naturalHeight} px). ` +
          `Minimum size is ${MIN_IMG_WIDTH}×${MIN_IMG_HEIGHT} px.`
        );
        return;
      }

      currentFile     = file;
      currentImg      = img;
      currentBaseName = file.name.replace(/\.[^.]+$/, '') || 'image';

      previewImg.src = e.target.result;
      previewFilename.textContent =
        `${escHtml(file.name)}  ·  ${(file.size / 1024).toFixed(0)} KB`;
      previewDims.textContent =
        `${img.naturalWidth} × ${img.naturalHeight} px`;

      previewPanel.style.display = 'flex';
      generateBtn.disabled       = false;
      resultsSection.style.display = 'none';
      paletteCard.style.display    = 'none';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

async function runPipeline() {
  setLoading(true, 'Sampling image…');
  await tick();

  try {
    const baseLayout = GRID_LAYOUTS[selectedLayout];

    // Use the user-specified cols/rows; derive cell size to match
    const cols  = customCols;
    const rows  = customRows;
    // Keep cell aspect ratio from the base layout, scaled to fit the new grid
    const scaleW = baseLayout.cols / cols;
    const scaleH = baseLayout.rows / rows;
    const cellW  = Math.max(4, Math.round(baseLayout.cellW * scaleW));
    const cellH  = Math.max(4, Math.round(baseLayout.cellH * scaleH));
    const layout = { ...baseLayout, cols, rows, cellW, cellH };

    setLoading(true, 'Mapping to palette…');
    await tick();

    // Build cell color index array using layout-specific sampling
    const cellIndices = buildCellIndices(currentImg, layout);

    setLoading(true, 'Building grid SVG…');
    await tick();

    const gridSVG   = buildGridSVG(cellIndices, layout);
    const mosaicSVG = buildMosaicSVG(cellIndices, layout);

    gridPreview.innerHTML   = '';
    mosaicPreview.innerHTML = '';
    gridPreview.appendChild(gridSVG.cloneNode(true));
    mosaicPreview.appendChild(mosaicSVG.cloneNode(true));

    // Store originals for download
    gridPreview.dataset.svg   = svgToString(gridSVG);
    mosaicPreview.dataset.svg = svgToString(mosaicSVG);

    renderPaletteUI(cellIndices);

    paletteCard.style.display    = 'block';
    resultsSection.style.display = 'grid';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showError('Processing failed: ' + err.message);
    console.error(err);
  } finally {
    setLoading(false);
  }
}

// ─── Cell Index Builder ───────────────────────────────────────────────────────

/**
 * For each cell in the layout grid, sample the source image and find the nearest
 * palette color. Returns a flat array of palette indices (0-based).
 */
function buildCellIndices(img, layout) {
  // Draw image into off-screen canvas at native resolution for sampling
  const canvas = document.createElement('canvas');
  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const { cols, rows, sample } = layout;
  const indices = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const [r, g, b] = sample(ctx, img.naturalWidth, img.naturalHeight, col, row, cols, rows);
      indices.push(nearestPaletteIndex(r, g, b));
    }
  }

  return indices;
}

// ─── Sampling Functions ───────────────────────────────────────────────────────

/** Sample the average color in a rectangular cell region */
function sampleSquare(ctx, imgW, imgH, col, row, cols, rows) {
  const x0 = Math.floor((col / cols) * imgW);
  const y0 = Math.floor((row / rows) * imgH);
  const x1 = Math.floor(((col + 1) / cols) * imgW);
  const y1 = Math.floor(((row + 1) / rows) * imgH);
  return averageRegion(ctx, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}

/** Sample center point for hexagon (flat-top, vertical step = cH * 0.75) */
function sampleHex(ctx, imgW, imgH, col, row, cols, rows) {
  const totalW = cols * 0.75 + 0.25;
  const totalH = rows * 0.75 + 0.625;
  const nx = (col * 0.75 + 0.5) / totalW;
  const ny = (row * 0.75 + (col % 2 === 1 ? 0.375 : 0) + 0.5) / totalH;
  return samplePoint(ctx, Math.round(nx * imgW), Math.round(ny * imgH));
}

/** Sample center of triangle cell */
function sampleTriangle(ctx, imgW, imgH, col, row, cols, rows) {
  const cx = ((col + 0.5) / cols) * imgW;
  const cy = ((row + 0.5) / rows) * imgH;
  return samplePoint(ctx, Math.round(cx), Math.round(cy));
}

/** Average color of a rectangular region */
function averageRegion(ctx, x, y, w, h) {
  try {
    const data = ctx.getImageData(x, y, w, h).data;
    let rSum = 0, gSum = 0, bSum = 0;
    const px = w * h;
    for (let i = 0; i < data.length; i += 4) {
      rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2];
    }
    return [Math.round(rSum / px), Math.round(gSum / px), Math.round(bSum / px)];
  } catch (e) {
    return [255, 255, 255];
  }
}

/** Single pixel sample (clamped) */
function samplePoint(ctx, x, y) {
  try {
    const d = ctx.getImageData(Math.max(0, x), Math.max(0, y), 1, 1).data;
    return [d[0], d[1], d[2]];
  } catch (e) {
    return [255, 255, 255];
  }
}

// ─── Palette Matching ─────────────────────────────────────────────────────────

function nearestPaletteIndex(r, g, b) {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    if (!enabledColors.has(i)) continue;
    const p = PALETTE[i];
    const d = (r - p.r) ** 2 + (g - p.g) ** 2 + (b - p.b) ** 2;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// ─── SVG Builders ─────────────────────────────────────────────────────────────

function buildGridSVG(cellIndices, layout) {
  const { cols, rows, cellW, cellH, draw } = layout;

  const legendItemH = 26;
  const legendPadV  = 24;
  const legendH     = Math.ceil(enabledColors.size / LEGEND_COLS) * legendItemH + legendPadV;
  const gridPixelW  = computeGridWidth(layout);
  const gridPixelH  = computeGridHeight(layout);
  const totalH      = gridPixelH + legendH;

  const svg = makeSVG(gridPixelW, totalH);

  // White background for grid area
  svg.appendChild(rect(0, 0, gridPixelW, gridPixelH, '#ffffff'));

  // Draw each cell — all cells white background, numbers only (including white/no-paint cells)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx     = row * cols + col;
      const pIdx    = cellIndices[idx];
      const color   = PALETTE[pIdx];
      const num     = pIdx + 1;
      const isWhite = pIdx === 24;
      draw(svg, col, row, cellW, cellH, color, num, isWhite, true, true); // forceWhite=true
    }
  }

  // Outer border — thick black, matching reference
  svg.appendChild(rectStroke(0, 0, gridPixelW, gridPixelH, '#000000', 3));

  // Legend
  appendLegend(svg, gridPixelH, gridPixelW, legendItemH);

  return svg;
}

function buildMosaicSVG(cellIndices, layout) {
  const { cols, rows, cellW, cellH, draw } = layout;
  const gridPixelW = computeGridWidth(layout);
  const gridPixelH = computeGridHeight(layout);

  const legendItemH = 26;
  const legendPadV  = 24;
  const legendH     = Math.ceil(enabledColors.size / LEGEND_COLS) * legendItemH + legendPadV;
  const totalH      = gridPixelH + legendH;

  const svg = makeSVG(gridPixelW, totalH);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx   = row * cols + col;
      const pIdx  = cellIndices[idx];
      const color = PALETTE[pIdx];
      draw(svg, col, row, cellW, cellH, color, 0, pIdx === 24, false);
    }
  }

  // Outer border
  svg.appendChild(rectStroke(0, 0, gridPixelW, gridPixelH, '#000000', 3));

  // Legend
  appendLegend(svg, gridPixelH, gridPixelW, legendItemH);

  return svg;
}

// ─── Grid Width/Height Calculators ───────────────────────────────────────────

function computeGridWidth(layout) {
  const { cols, cellW } = layout;
  if (layout.label === 'Hexagons') {
    return Math.round(cols * cellW * 0.75 + cellW * 0.25);
  }
  return cols * cellW;
}

function computeGridHeight(layout) {
  const { rows, cellH } = layout;
  if (layout.label === 'Hexagons') {
    return Math.round(rows * cellH * 0.75 + cellH * 0.625);
  }
  return rows * cellH;
}

// ─── Cell Draw Functions ──────────────────────────────────────────────────────

// Number label: always black, zero-padded (01–25), shown in ALL cells on grid view
// (including white/no-paint cells — user needs to know not to paint those too)
const NUM_COLOR    = '#111111';
const BORDER_COLOR = '#000000';
const BORDER_W     = 0.5;  // border drawn inset so adjacent cells share edges perfectly

/** Draw a rect that is inset by half stroke so borders don't create gaps */
function cellRect(svg, x, y, cW, cH, fill) {
  const half = BORDER_W / 2;
  svg.appendChild(rect(x + half, y + half, cW - BORDER_W, cH - BORDER_W, fill, BORDER_COLOR, BORDER_W));
}

function cellNumStr(num) {
  return String(num).padStart(2, '0');
}

/** Square cell */
function drawSquareCell(svg, col, row, cW, cH, color, num, isWhite, withNumber, forceWhite) {
  const x    = col * cW;
  const y    = row * cH;
  const fill = forceWhite ? '#ffffff' : (isWhite ? '#ffffff' : rgbStr(color));
  cellRect(svg, x, y, cW, cH, fill);
  if (withNumber) {
    svg.appendChild(text(x + cW / 2, y + cH / 2, cellNumStr(num), NUM_COLOR, Math.max(5, Math.floor(cW * 0.38))));
  }
}

/** Rectangular cell */
function drawRectCell(svg, col, row, cW, cH, color, num, isWhite, withNumber, forceWhite) {
  drawSquareCell(svg, col, row, cW, cH, color, num, isWhite, withNumber, forceWhite);
}

/** Hexagon cell — flat-top, gapless tiling.
 *  Flat-top hex math:
 *    horizontal step = cW * 0.75   (cols overlap by 25%)
 *    vertical step   = cH * 0.75   (rows overlap by 25% — this removes the gaps)
 *    odd-col offset  = cH * 0.375  (half the vertical step)
 */
function drawHexCell(svg, col, row, cW, cH, color, num, isWhite, withNumber, forceWhite) {
  const cx = col * cW * 0.75 + cW / 2;
  const cy = row * cH * 0.75 + (col % 2 === 1 ? cH * 0.375 : 0) + cH / 2;
  // Expand by 0.75px so neighbouring hexes fully overlap and leave no gap
  const rx = cW / 2 + 0.75;
  const ry = cH / 2 + 0.75;

  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i; // flat-top: first point at 0°
    pts.push(`${(cx + rx * Math.cos(angle)).toFixed(2)},${(cy + ry * Math.sin(angle)).toFixed(2)}`);
  }

  const fill = forceWhite ? '#ffffff' : (isWhite ? '#ffffff' : rgbStr(color));
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts.join(' '));
  poly.setAttribute('fill', fill);
  poly.setAttribute('stroke', BORDER_COLOR);
  poly.setAttribute('stroke-width', BORDER_W);
  svg.appendChild(poly);

  if (withNumber) {
    svg.appendChild(text(cx, cy, cellNumStr(num), NUM_COLOR, Math.max(4, Math.floor(cW * 0.28))));
  }
}

/** Triangle cell — alternating up/down triangles per column */
function drawTriangleCell(svg, col, row, cW, cH, color, num, isWhite, withNumber, forceWhite) {
  const x    = col * cW;
  const y    = row * cH;
  const isUp = col % 2 === 0;
  const h    = BORDER_W / 2;

  // Inset points slightly so shared edges don't double up
  const pts = isUp
    ? `${x + h},${y + cH - h} ${x + cW / 2},${y + h} ${x + cW - h},${y + cH - h}`
    : `${x + h},${y + h} ${x + cW - h},${y + h} ${x + cW / 2},${y + cH - h}`;

  const fill = forceWhite ? '#ffffff' : (isWhite ? '#ffffff' : rgbStr(color));
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts);
  poly.setAttribute('fill', fill);
  poly.setAttribute('stroke', BORDER_COLOR);
  poly.setAttribute('stroke-width', BORDER_W);
  svg.appendChild(poly);

  if (withNumber) {
    const cx = x + cW / 2;
    const cy = isUp ? y + cH * 0.65 : y + cH * 0.35;
    svg.appendChild(text(cx, cy, cellNumStr(num), NUM_COLOR, Math.max(4, Math.floor(cW * 0.28))));
  }
}

/** Circle cell — circles touch edge-to-edge with no gap */
function drawCircleCell(svg, col, row, cW, cH, color, num, isWhite, withNumber, forceWhite) {
  const cx   = col * cW + cW / 2;
  const cy   = row * cH + cH / 2;
  const r    = Math.min(cW, cH) / 2 - BORDER_W / 2;
  const fill = forceWhite ? '#ffffff' : (isWhite ? '#ffffff' : rgbStr(color));

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', cx.toFixed(2));
  circle.setAttribute('cy', cy.toFixed(2));
  circle.setAttribute('r', r.toFixed(2));
  circle.setAttribute('fill', fill);
  circle.setAttribute('stroke', BORDER_COLOR);
  circle.setAttribute('stroke-width', BORDER_W);
  svg.appendChild(circle);

  if (withNumber) {
    svg.appendChild(text(cx, cy, cellNumStr(num), NUM_COLOR, Math.max(5, Math.floor(r * 0.65))));
  }
}

/** Diamond cell */
function drawDiamondCell(svg, col, row, cW, cH, color, num, isWhite, withNumber, forceWhite) {
  const cx   = col * cW + cW / 2;
  const cy   = row * cH + cH / 2;
  const h    = BORDER_W / 2;
  const pts  = `${cx},${cy - cH / 2 + h} ${cx + cW / 2 - h},${cy} ${cx},${cy + cH / 2 - h} ${cx - cW / 2 + h},${cy}`;
  const fill = forceWhite ? '#ffffff' : (isWhite ? '#ffffff' : rgbStr(color));

  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts);
  poly.setAttribute('fill', fill);
  poly.setAttribute('stroke', BORDER_COLOR);
  poly.setAttribute('stroke-width', BORDER_W);
  svg.appendChild(poly);

  if (withNumber) {
    svg.appendChild(text(cx, cy, cellNumStr(num), NUM_COLOR, Math.max(4, Math.floor(cW * 0.28))));
  }
}

// ─── Legend Builder ───────────────────────────────────────────────────────────
// Layout matches reference images: 5 columns, swatch + zero-padded number + name,
// no section title, white background.

function appendLegend(svg, offsetY, svgW, itemH) {
  // Only show colors that are enabled and appear in the grid
  const usedIndices = [...enabledColors].sort((a, b) => a - b);
  const legendCols  = LEGEND_COLS;
  const legendRows  = Math.ceil(usedIndices.length / legendCols);
  const padX    = 16;
  const padTop  = 12;
  const startY  = offsetY + padTop;
  const colW    = Math.floor((svgW - padX * 2) / legendCols);
  const swatchW = 18;
  const swatchH = 14;
  const legendH = legendRows * itemH + padTop * 2;

  svg.appendChild(rect(0, offsetY, svgW, legendH, '#ffffff', '#000000', 1));

  usedIndices.forEach((paletteIdx, pos) => {
    const color = PALETTE[paletteIdx];
    const col = pos % legendCols;
    const row = Math.floor(pos / legendCols);
    const lx  = padX + col * colW;
    const ly  = startY + row * itemH;

    const sw = rect(lx, ly, swatchW, swatchH, rgbStr(color), '#000000', 0.5);
    svg.appendChild(sw);

    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', lx + swatchW + 5);
    lbl.setAttribute('y', ly + swatchH / 2 + 1);
    lbl.setAttribute('font-family', 'Arial, sans-serif');
    lbl.setAttribute('font-size', '11');
    lbl.setAttribute('dominant-baseline', 'central');
    lbl.setAttribute('fill', '#111111');
    lbl.textContent = String(paletteIdx + 1).padStart(2, '0');
    svg.appendChild(lbl);
  });
}

// ─── Palette UI ───────────────────────────────────────────────────────────────

function isLightColor({ r, g, b }) {
  // perceived luminance — use dark text on light swatches
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
}

function renderPaletteUI(cellIndices) {
  colorPalette.innerHTML = '';

  const usage = new Array(PALETTE.length).fill(0);
  cellIndices.forEach(i => usage[i]++);

  PALETTE.forEach((color, i) => {
    const item = document.createElement('div');
    item.className = 'swatch-item';
    item.style.background = rgbStr(color);
    item.dataset.light = isLightColor(color) ? 'true' : 'false';
    if (i === 24) item.style.border = '1.5px dashed #999'; // white/no-paint
    item.title = `${i + 1}. ${color.name} — ${usage[i]} cells`;
    item.textContent = String(i + 1).padStart(2, '0');
    colorPalette.appendChild(item);
  });
}

// ─── SVG Helpers ─────────────────────────────────────────────────────────────

function makeSVG(w, h) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  return svg;
}

function rect(x, y, w, h, fill, stroke, strokeW) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  el.setAttribute('x', x);
  el.setAttribute('y', y);
  el.setAttribute('width', w);
  el.setAttribute('height', h);
  el.setAttribute('fill', fill || 'none');
  if (stroke) { el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', strokeW || 1); }
  return el;
}

function rectStroke(x, y, w, h, stroke, strokeW) {
  return rect(x, y, w, h, 'none', stroke, strokeW);
}

function text(x, y, content, fill, fontSize) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  el.setAttribute('x', x.toFixed(2));
  el.setAttribute('y', y.toFixed(2));
  el.setAttribute('text-anchor', 'middle');
  el.setAttribute('dominant-baseline', 'central');
  el.setAttribute('font-family', 'Arial, sans-serif');
  el.setAttribute('font-size', fontSize || 10);
  el.setAttribute('fill', fill || '#000000');
  el.textContent = content;
  return el;
}

function rgbStr({ r, g, b }) {
  return `rgb(${r},${g},${b})`;
}

function darken({ r, g, b }) {
  return `rgb(${Math.round(r * 0.45)},${Math.round(g * 0.45)},${Math.round(b * 0.45)})`;
}

function svgToString(svg) {
  return new XMLSerializer().serializeToString(svg);
}

function downloadSVG(svgEl, filename) {
  if (!svgEl) return;
  const str  = svgToString(svgEl);
  const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.download = filename;
  a.href     = url;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function clearAll() {
  currentFile     = null;
  currentImg      = null;
  currentBaseName = 'image';

  fileInput.value = '';
  previewImg.src  = '';
  previewFilename.textContent = '';
  previewDims.textContent     = '';

  previewPanel.style.display   = 'none';
  resultsSection.style.display = 'none';
  paletteCard.style.display    = 'none';
  generateBtn.disabled         = true;

  hideError();
}

function showError(msg) {
  errorText.textContent     = msg;
  errorBanner.style.display = 'flex';
}

function hideError() {
  errorBanner.style.display = 'none';
}

function setLoading(on, message = '') {
  loadingOverlay.style.display = on ? 'flex' : 'none';
  if (message) loadingText.textContent = message;
}

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
