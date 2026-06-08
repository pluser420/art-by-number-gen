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
const LEGEND_COLS    = 5;  // swatches per row in legend

// ─── State ────────────────────────────────────────────────────────────────────
let currentFile      = null;
let currentImg       = null;
let currentBaseName  = 'image';
let selectedLayout   = 'squares';

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const fileInput       = document.getElementById('fileInput');
const dropZone        = document.getElementById('dropZone');
const previewSection  = document.getElementById('previewSection');
const previewImg      = document.getElementById('previewImg');
const imageInfo       = document.getElementById('imageInfo');
const clearBtn        = document.getElementById('clearBtn');
const errorBanner     = document.getElementById('errorBanner');
const errorText       = document.getElementById('errorText');
const dismissError    = document.getElementById('dismissError');
const layoutSelect    = document.getElementById('layoutSelect');
const generateBtn     = document.getElementById('generateBtn');
const loadingOverlay  = document.getElementById('loadingOverlay');
const loadingText     = document.getElementById('loadingText');
const resultsSection  = document.getElementById('resultsSection');
const gridPreview     = document.getElementById('gridPreview');
const mosaicPreview   = document.getElementById('mosaicPreview');
const downloadGrid    = document.getElementById('downloadGrid');
const downloadMosaic  = document.getElementById('downloadMosaic');
const colorPalette    = document.getElementById('colorPalette');

// ─── Init ─────────────────────────────────────────────────────────────────────

// Populate layout selector
Object.entries(GRID_LAYOUTS).forEach(([key, layout]) => {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = layout.label;
  layoutSelect.appendChild(opt);
});

layoutSelect.addEventListener('change', () => {
  selectedLayout = layoutSelect.value;
});

// ─── Event Wiring ─────────────────────────────────────────────────────────────

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

dropZone.addEventListener('click', () => fileInput.click());

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
      imageInfo.innerHTML =
        `<strong>File:</strong> ${escHtml(file.name)}<br>` +
        `<strong>Size:</strong> ${(file.size / 1024).toFixed(0)} KB<br>` +
        `<strong>Dimensions:</strong> ${img.naturalWidth} × ${img.naturalHeight} px`;

      previewSection.style.display = 'block';
      generateBtn.disabled         = false;
      resultsSection.style.display = 'none';
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
    const layout = GRID_LAYOUTS[selectedLayout];

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

    resultsSection.style.display = 'block';
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
    const p = PALETTE[i];
    const d = (r - p.r) ** 2 + (g - p.g) ** 2 + (b - p.b) ** 2;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// ─── SVG Builders ─────────────────────────────────────────────────────────────

function buildGridSVG(cellIndices, layout) {
  const { cols, rows, cellW, cellH, draw } = layout;

  // Legend dimensions — 5 cols, no title, zero-padded numbers
  const legendRows  = Math.ceil(PALETTE.length / LEGEND_COLS);
  const legendItemH = 26;
  const legendPadV  = 24;
  const legendH     = legendRows * legendItemH + legendPadV;
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

  const legendRows  = Math.ceil(PALETTE.length / LEGEND_COLS);
  const legendItemH = 26;
  const legendPadV  = 24;
  const legendH     = legendRows * legendItemH + legendPadV;
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
  if (layout === GRID_LAYOUTS.hexagons) {
    // flat-top: cols * 0.75 steps + the remaining 0.25 for the last col
    return Math.round(cols * cellW * 0.75 + cellW * 0.25);
  }
  return cols * cellW;
}

function computeGridHeight(layout) {
  const { rows, cellH } = layout;
  if (layout === GRID_LAYOUTS.hexagons) {
    // flat-top: rows * 0.75 vertical steps + 0.25 for the last row + 0.375 for odd-col offset
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
  const padX    = 16;
  const padTop  = 12;
  const startY  = offsetY + padTop;
  const colW    = Math.floor((svgW - padX * 2) / LEGEND_COLS);
  const swatchW = 18;
  const swatchH = 14;
  const legendH = Math.ceil(PALETTE.length / LEGEND_COLS) * itemH + padTop * 2;

  // Legend background — white
  svg.appendChild(rect(0, offsetY, svgW, legendH, '#ffffff', '#000000', 1));

  PALETTE.forEach((color, i) => {
    const col = i % LEGEND_COLS;
    const row = Math.floor(i / LEGEND_COLS);
    const lx  = padX + col * colW;
    const ly  = startY + row * itemH;

    // Swatch with black border (white swatch gets dashed border)
    const sw = rect(lx, ly, swatchW, swatchH, rgbStr(color), '#000000', 0.5);
    svg.appendChild(sw);

    // Zero-padded number label, e.g. "01", "25"
    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', lx + swatchW + 5);
    lbl.setAttribute('y', ly + swatchH / 2 + 1);
    lbl.setAttribute('font-family', 'Arial, sans-serif');
    lbl.setAttribute('font-size', '11');
    lbl.setAttribute('dominant-baseline', 'central');
    lbl.setAttribute('fill', '#111111');
    lbl.textContent = String(i + 1).padStart(2, '0');
    svg.appendChild(lbl);
  });
}

// ─── Palette UI ───────────────────────────────────────────────────────────────

function renderPaletteUI(cellIndices) {
  colorPalette.innerHTML = '';

  // Count usage per palette entry
  const usage = new Array(PALETTE.length).fill(0);
  cellIndices.forEach(i => usage[i]++);

  const title = document.createElement('h3');
  title.textContent = `Color Palette (${PALETTE.length} colors)`;
  colorPalette.appendChild(title);

  const wrap = document.createElement('div');
  wrap.className = 'palette-swatches';

  PALETTE.forEach((color, i) => {
    const item = document.createElement('div');
    item.className = 'swatch-item';

    const box = document.createElement('div');
    box.className = 'swatch-box';
    box.style.background = rgbStr(color);
    box.style.border = i === 24 ? '1px dashed #aaa' : '1px solid rgba(0,0,0,0.12)';
    box.title = `${color.name} — ${usage[i]} cells`;

    const label = document.createElement('span');
    label.textContent = `${i + 1}`;

    item.appendChild(box);
    item.appendChild(label);
    wrap.appendChild(item);
  });

  colorPalette.appendChild(wrap);
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

  previewSection.style.display  = 'none';
  resultsSection.style.display  = 'none';
  generateBtn.disabled          = true;

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
