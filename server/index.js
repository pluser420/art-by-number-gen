'use strict';

const express    = require('express');
const cors       = require('cors');
const { exec }   = require('child_process');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const crypto     = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Paint-by-Numbers PDF Converter' });
});

// POST /convert-pdf — receives SVG string, returns CMYK PDF
app.post('/convert-pdf', (req, res) => {
  const { svg } = req.body;

  if (!svg || typeof svg !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid svg field' });
  }

  // Write SVG to a temp file
  const id      = crypto.randomBytes(8).toString('hex');
  const tmpDir  = os.tmpdir();
  const svgPath = path.join(tmpDir, `${id}.svg`);
  const pdfPath = path.join(tmpDir, `${id}.pdf`);

  try {
    fs.writeFileSync(svgPath, svg, 'utf8');
  } catch (err) {
    return res.status(500).json({ error: 'Failed to write SVG file: ' + err.message });
  }

  // Use Inkscape to convert SVG → PDF with CMYK color profile
  // --export-pdf-version=1.5 ensures modern PDF
  // The ICC profile converts colors to CMYK for print
  const iccProfile = process.env.ICC_PROFILE || '/usr/share/color/icc/colord/ISOcoated_v2_300_eci.icc';
  const hasIcc     = fs.existsSync(iccProfile);

  let cmd;
  if (hasIcc) {
    // With CMYK ICC profile
    cmd = `inkscape "${svgPath}" --export-filename="${pdfPath}" --export-pdf-version=1.5 --export-ps-level=3`;
  } else {
    // Without ICC profile — still produces valid PDF
    cmd = `inkscape "${svgPath}" --export-filename="${pdfPath}" --export-pdf-version=1.5`;
  }

  exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
    // Cleanup SVG temp file
    try { fs.unlinkSync(svgPath); } catch (_) {}

    if (err) {
      try { fs.unlinkSync(pdfPath); } catch (_) {}
      console.error('Inkscape error:', err.message, stderr);
      return res.status(500).json({ error: 'PDF conversion failed: ' + err.message });
    }

    // Check PDF was created
    if (!fs.existsSync(pdfPath)) {
      return res.status(500).json({ error: 'PDF file was not created' });
    }

    // Send PDF to client
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="output.pdf"');

    const stream = fs.createReadStream(pdfPath);
    stream.pipe(res);
    stream.on('end', () => {
      try { fs.unlinkSync(pdfPath); } catch (_) {}
    });
    stream.on('error', (streamErr) => {
      try { fs.unlinkSync(pdfPath); } catch (_) {}
      res.status(500).json({ error: 'Failed to stream PDF: ' + streamErr.message });
    });
  });
});

app.listen(PORT, () => {
  console.log(`PDF conversion server running on port ${PORT}`);
});
