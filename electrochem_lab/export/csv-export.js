/**
 * export/csv-export.js
 * Exports the observation log as a CSV file download.
 *
 * The `runs` array is the internal format stored by ObsPanel._runs:
 *   [{
 *     timestamp:    string,
 *     electrolyte:  string,   // formula
 *     anodeName:    string,
 *     cathodeName:  string,
 *     observations: string[],
 *     equations:    { cathode: string, anode: string },
 *   }, ...]
 *
 * Optional extra test results are passed as the `tests` array (flat list of
 * { testType, target, observation } objects accumulated from TestResults).
 */

/**
 * Download the run log as a CSV file.
 * @param {object[]} runs       — ObsPanel._runs
 * @param {object[]} [tests]    — optional flat list of test results to append
 */
export function exportCSV(runs, tests = []) {
  if (!runs.length) return;

  const header = [
    'Run',
    'Time',
    'Electrolyte',
    'Anode electrode',
    'Cathode electrode',
    'Cathode observation',
    'Anode observation',
    'Cathode equation',
    'Anode equation',
  ];

  const rows = runs.map((r, i) => [
    i + 1,
    r.timestamp,
    r.electrolyte,
    r.anodeName,
    r.cathodeName,
    r.observations[0] ?? '',
    r.observations[1] ?? '',
    r.equations?.cathode ?? '',
    r.equations?.anode   ?? '',
  ]);

  // Append test rows (each tagged with their run number via timestamp match)
  const testRows = tests.map(t => [
    '',     // run # (blank — these are supplemental)
    t.timestamp ?? '',
    '',     // electrolyte
    '',     // anode
    '',     // cathode
    `[Test: ${t.testType} @ ${t.target}] ${t.observation}`,
    '',
    '',
    '',
  ]);

  const allRows  = [...rows, ...testRows];
  const csvLines = [[...header], ...allRows].map(row =>
    row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
  );
  const csvText  = csvLines.join('\r\n');

  _downloadText(csvText, 'electrolysis-observations.csv', 'text/csv');
}

// ── internal helpers ────────────────────────────────────────────────────────

function _downloadText(text, filename, mimeType) {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8;` });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.rel      = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Let the browser finish the download before revoking
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
