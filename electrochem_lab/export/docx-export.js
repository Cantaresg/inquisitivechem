/**
 * export/docx-export.js
 * Exports the observation log as a .docx file download.
 *
 * Uses the `docx` library loaded lazily from jsDelivr CDN to keep the main
 * bundle lean. If the CDN is unavailable, the function rejects gracefully and
 * lets the caller surface an error to the user.
 *
 * Accepts the same `runs` array as csv-export.js plus a config object so the
 * correct equation style (O-Level word equations vs A-Level half-equations) is
 * reflected in the document.
 */

const DOCX_CDN = 'https://cdn.jsdelivr.net/npm/docx@8/build/index.min.js';

/**
 * Download the run log as a Word .docx file.
 * @param {object[]} runs         — ObsPanel._runs
 * @param {{ level: string, title?: string }} config
 * @returns {Promise<void>}
 */
export async function exportDocx(runs, config = {}) {
  if (!runs.length) return;

  // Lazy-load the docx library
  let docxLib;
  try {
    docxLib = await import(DOCX_CDN);
  } catch {
    throw new Error(
      'Could not load the Word export library. Check your internet connection and try again.'
    );
  }

  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    HeadingLevel, AlignmentType, WidthType, BorderStyle,
  } = docxLib;

  const now   = new Date().toLocaleDateString('en-SG', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const title = config.title ?? 'Electrochemistry Observations';
  const level = config.level ?? 'O_LEVEL';

  // ── Document children ──────────────────────────────────────────────────
  const children = [];

  // Title
  children.push(new Paragraph({
    text:    `${title} — ${now}`,
    heading: HeadingLevel.HEADING_1,
  }));

  // Curriculum level note
  children.push(new Paragraph({
    children: [new TextRun({
      text: `Curriculum level: ${level === 'A_LEVEL' ? 'A-Level' : 'O-Level'}`,
      italics: true,
      color:  '888888',
    })],
  }));
  children.push(new Paragraph({ text: '' }));   // spacer

  // Summary configuration table
  children.push(new Paragraph({
    text:    'Summary',
    heading: HeadingLevel.HEADING_2,
  }));
  children.push(_buildSummaryTable(runs, { Table, TableRow, TableCell, TextRun, WidthType, BorderStyle }));
  children.push(new Paragraph({ text: '' }));

  // Per-run sections
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];

    children.push(new Paragraph({
      text:    `Run ${i + 1} — ${r.electrolyte}`,
      heading: HeadingLevel.HEADING_2,
    }));

    // Config sub-heading
    children.push(new Paragraph({
      children: [
        new TextRun({ text: 'Anode (+): ', bold: true }),
        new TextRun({ text: r.anodeName }),
        new TextRun({ text: '   |   Cathode (−): ', bold: true }),
        new TextRun({ text: r.cathodeName }),
      ],
    }));
    children.push(new Paragraph({ text: '' }));

    // Observations
    children.push(new Paragraph({ text: 'Observations:', bold: true }));
    for (const obs of r.observations) {
      children.push(new Paragraph({
        text:   obs,
        bullet: { level: 0 },
      }));
    }
    children.push(new Paragraph({ text: '' }));

    // Equations
    if (r.equations) {
      children.push(new Paragraph({ text: 'Equations:', bold: true }));
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'Cathode (−):  ', bold: true }),
          new TextRun({ text: r.equations.cathode ?? '—', font: 'Courier New' }),
        ],
      }));
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'Anode (+):    ', bold: true }),
          new TextRun({ text: r.equations.anode ?? '—', font: 'Courier New' }),
        ],
      }));
    }

    children.push(new Paragraph({ text: '' }));
  }

  // ── Build and download ─────────────────────────────────────────────────
  const doc  = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);

  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'electrolysis-observations.docx';
  a.rel      = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _buildSummaryTable(runs, { Table, TableRow, TableCell, TextRun, WidthType, BorderStyle }) {
  const headerRow = new TableRow({
    children: ['Run', 'Electrolyte', 'Anode', 'Cathode'].map(h =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true })],
        })],
      })
    ),
  });

  const dataRows = runs.map((r, i) =>
    new TableRow({
      children: [String(i + 1), r.electrolyte, r.anodeName, r.cathodeName].map(text =>
        new TableCell({ children: [new Paragraph({ text })] })
      ),
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows:  [headerRow, ...dataRows],
  });
}
