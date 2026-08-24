// Duplicates Sheet1 to a timestamped Backup_Sheet1_<label> tab before anything
// destructive. writeToSheet in the scraper clears and rewrites the whole of
// Sheet1, so a backup is the only undo there is.
//
//   node backup-sheet.js 2026-08-24_pre_rbyc
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

for (const line of fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) process.env[line.slice(0, i)] = line.slice(i + 1);
}

(async () => {
  const label = process.argv[2];
  if (!label) { console.error('Give me a label, e.g. 2026-08-24_pre_rbyc'); process.exit(1); }
  const spreadsheetId = process.env.NEXT_PUBLIC_SHEET_ID;
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const src = meta.data.sheets.find(s => s.properties.title === 'Sheet1');
  if (!src) throw new Error('No Sheet1 found');
  const title = `Backup_Sheet1_${label}`;
  if (meta.data.sheets.some(s => s.properties.title === title)) {
    console.log(`${title} already exists — leaving it alone.`);
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        duplicateSheet: {
          sourceSheetId: src.properties.sheetId,
          newSheetName: title,
          insertSheetIndex: meta.data.sheets.length,
        },
      }],
    },
  });

  const rows = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${title}!A:A` });
  console.log(`Created ${title} with ${(rows.data.values || []).length - 1} data rows.`);
})().catch(e => { console.error('Backup failed:', e.message); process.exit(1); });
