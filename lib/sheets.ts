import { google, sheets_v4 } from 'googleapis';

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID!;

// Real transactions that are NOT spend. Kept in the Sheet and visible in the
// table, but excluded from every total and chart:
//   Investments       — fund subscriptions, warrants, deal payments
//   Card Payments     — paying off a credit card. The purchases on that card are
//                       already captured individually, so counting these too
//                       double-counts (~$470k on Amex alone).
//   Internal Transfers— money between ASM's own entities (Azlin / AM Advisors /
//                       BLIF), not money leaving for a third party.
//   Business (BLIF/AMA) — anything belonging to the fund (BLIF / MFLP / its
//                       investors and administrators) or the advisory firm
//                       (AM Advisors). ASM: "no blif expenses should be here.
//                       nor should any am advisors ones".
//   Real estate       — property purchases (the Godrej unit). Money out, but
//                       buying an asset, not spending. ASM: "take out godrej
//                       real estate transactions".
export const NON_EXPENSE_CATEGORIES = [
  'Investments', 'Card Payments', 'Internal Transfers', 'Business (BLIF/AMA)', 'Real estate',
];

export function isExpense(r: { category?: string }) {
  return !NON_EXPENSE_CATEGORIES.includes(r.category || '');
}

// Must stay in step with CATEGORY_KEYWORDS in receipt-scraper.js.
export const CATEGORIES = [
  'Airlines', 'Hotels', 'Travel', 'Transportation', 'Food', 'Groceries', 'Media',
  'IT', 'Website', 'Telecom', 'Utilities', 'Insurance', 'Financial Services',
  'Professional Services', 'Shopping', 'Health', 'Education', 'Clubs & Memberships',
  'Investments', 'Card Payments', 'Internal Transfers', 'Business (BLIF/AMA)',
  'Real estate', 'Rent', 'Home Employees', 'Donation', 'Legal',
  'Conference', 'Other',
];

// Categories that mean "not yet classified". "?" is a literal answer the CLI
// review flow used to record for "I looked and still don't know".
export const UNCLASSIFIED = ['?', 'Other', ''];

// Same normalisation the scraper uses, so a decision made here matches the key
// the scraper looks up.
export function vendorKeyFor(vendor: string) {
  return (vendor || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const VENDOR_TAB = 'VendorCategories';

const normalizeSubject = (s: string) => String(s || '')
  .replace(/^(\s*(re|fwd?|fw)\s*:\s*|\s*\{external\}\s*)+/gi, '')
  .replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Candidate duplicate groups, for human judgement rather than automatic merging.
 * Two rows are candidates when the amount is identical AND either the normalised
 * subject matches or they share the vendor. Deliberately loose — the point is to
 * surface things for review, not to decide.
 */
export async function getDuplicateGroups() {
  const receipts = await getAllReceipts();

  const buckets = new Map<string, any[]>();
  receipts.forEach((r, i) => {
    if (!r.amount) return;
    const key = `${r.amount}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push({ ...r, rowIndex: i });
  });

  const groups: any[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    // Within an amount bucket, cluster by subject or vendor.
    const used = new Set<number>();
    for (let i = 0; i < bucket.length; i++) {
      if (used.has(i)) continue;
      const cluster = [bucket[i]];
      used.add(i);
      for (let j = i + 1; j < bucket.length; j++) {
        if (used.has(j)) continue;
        const a = bucket[i], b = bucket[j];
        const sameSubject = normalizeSubject(a.subject) === normalizeSubject(b.subject);
        const sameVendor = (a.vendor || '').toLowerCase() === (b.vendor || '').toLowerCase();
        if (sameSubject || sameVendor) { cluster.push(b); used.add(j); }
      }
      if (cluster.length > 1) {
        groups.push({
          key: `${cluster[0].amount}|${normalizeSubject(cluster[0].subject)}`,
          amount: cluster[0].amount,
          currency: cluster[0].currency,
          usdEach: cluster[0].usdEstimate,
          wastedUsd: cluster.slice(1).reduce((s: number, r: any) => s + (r.usdEstimate || 0), 0),
          rows: cluster.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')),
        });
      }
    }
  }

  return groups.sort((a, b) => b.wastedUsd - a.wastedUsd);
}

/** Deletes the given sheet rows (0-based data indices), bottom-up. */
export async function mergeDuplicates(rowIndices: number[]) {
  await deleteReceipts(rowIndices);
  return { deleted: rowIndices.length };
}

/**
 * Groups every unclassified row by vendor. 179 rows collapse to ~33 vendors, so
 * the review screen asks ~33 questions instead of 179.
 */
export async function getReviewQueue() {
  const receipts = await getAllReceipts();

  const groups = new Map<string, {
    vendorKey: string; vendor: string; category: string;
    count: number; totalUsd: number; rowIndices: number[];
    accounts: Set<string>; samples: string[]; latest: string;
  }>();

  receipts.forEach((r, i) => {
    if (!UNCLASSIFIED.includes(r.category)) return;
    const key = vendorKeyFor(r.vendor);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, {
        vendorKey: key, vendor: r.vendor, category: r.category,
        count: 0, totalUsd: 0, rowIndices: [], accounts: new Set(), samples: [], latest: '',
      });
    }
    const g = groups.get(key)!;
    g.count += 1;
    g.totalUsd += r.usdEstimate || 0;
    g.rowIndices.push(i);
    if (r.emailAccount) g.accounts.add(r.emailAccount);
    if (g.samples.length < 4 && r.subject) g.samples.push(r.subject);
    if (r.date > g.latest) g.latest = r.date;
  });

  // Biggest spend first — classifying those moves the numbers most.
  return [...groups.values()]
    .map(g => ({ ...g, accounts: [...g.accounts] }))
    .sort((a, b) => b.totalUsd - a.totalUsd || b.count - a.count);
}

/**
 * Applies a category to every row of a vendor AND records the decision on the
 * VendorCategories tab, which the scraper reads before classifying. That second
 * part is what stops the next scrape undoing the work.
 */
export async function classifyVendor(vendorKey: string, category: string) {
  const receipts = await getAllReceipts();
  const requests: sheets_v4.Schema$Request[] = [];

  receipts.forEach((r, i) => {
    if (vendorKeyFor(r.vendor) !== vendorKey) return;
    if (!UNCLASSIFIED.includes(r.category)) return; // never overwrite a real category
    requests.push(setCellRequest(i + 1, 4, category)); // column E
  });

  await runBatch(requests);
  await upsertVendorCategory(vendorKey, category);
  return { rowsUpdated: requests.length };
}

async function upsertVendorCategory(vendorKey: string, category: string) {
  const sheets = await getSheets();

  let rows: any[][] = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: `${VENDOR_TAB}!A:B`,
    });
    rows = res.data.values || [];
  } catch {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: VENDOR_TAB } } }] },
    });
    rows = [['Vendor (lowercased key)', 'Category']];
  }

  const idx = rows.findIndex((r, i) => i > 0 && vendorKeyFor(String(r[0] || '')) === vendorKey);
  if (idx > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${VENDOR_TAB}!B${idx + 1}`,
      valueInputOption: 'RAW', requestBody: { values: [[category]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `${VENDOR_TAB}!A:B`,
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[vendorKey, category]] },
    });
  }
}

function getAuth() {
  const credStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credStr) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON');
  const credentials = JSON.parse(credStr);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export async function getSheets() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

// Sheets wants a typed ExtendedValue, not a bare string.
function cellValue(value: any): sheets_v4.Schema$ExtendedValue {
  if (typeof value === 'number') return { numberValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  const str = value == null ? '' : String(value);
  if (str.startsWith('=')) return { formulaValue: str };
  return { stringValue: str };
}

async function runBatch(requests: sheets_v4.Schema$Request[]) {
  if (requests.length === 0) return;
  const sheets = await getSheets();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests },
  });
}

function setCellRequest(
  rowIndex: number,
  columnIndex: number,
  value: any
): sheets_v4.Schema$Request {
  return {
    updateCells: {
      range: {
        sheetId: 0,
        startRowIndex: rowIndex,
        endRowIndex: rowIndex + 1,
        startColumnIndex: columnIndex,
        endColumnIndex: columnIndex + 1,
      },
      rows: [{ values: [{ userEnteredValue: cellValue(value) }] }],
      fields: 'userEnteredValue',
    },
  };
}

// Sheets can hand back a real number, or a display string like "4,080.30" / "$272.20".
// parseFloat on the latter silently returns 4 and NaN respectively, so coerce carefully.
function toNumber(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export async function getAllReceipts() {
  const sheets = await getSheets();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:M',
      // Numbers as numbers (no thousands separators or currency symbols),
      // but dates still as "YYYY-MM-DD" rather than serial numbers.
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    const rows = response.data.values || [];
    if (rows.length === 0) return [];

    return rows.slice(1).map((row: any[]) => ({
      date: row[0] || '',
      vendor: row[1] || '',
      currency: row[2] || '',
      amount: toNumber(row[3]),
      category: row[4] || '',
      isSubscription: row[5] || '',
      renewalDate: row[6] || '',
      paymentMethod: row[7] || '',
      emailAccount: row[8] || '',
      subject: row[9] || '',
      usdEstimate: toNumber(row[10]),
      month: row[11] || '',
      description: row[12] || '',
    }));
  } catch (err) {
    console.error('Error fetching receipts:', err);
    return [];
  }
}

export async function addReceipt(receipt: any) {
  const sheets = await getSheets();

  // Find the row this append will land on so the formulas point at themselves.
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Sheet1!A:A',
  });
  const rowNum = (existing.data.values?.length || 1) + 1;

  const values = [
    [
      receipt.date,
      receipt.vendor,
      receipt.currency,
      receipt.amount,
      receipt.category,
      receipt.isSubscription,
      receipt.renewalDate,
      receipt.paymentMethod,
      'Manual Entry',
      receipt.subject,
      `=IF($D${rowNum}="","",IFERROR($D${rowNum}*VLOOKUP($C${rowNum},Summary!$R$2:$S$30,2,FALSE),$D${rowNum}))`,
      `=IF(A${rowNum}="","",TEXT(A${rowNum},"YYYY-MM"))`,
      receipt.description || '',
    ],
  ];

  try {
    return await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:M',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
  } catch (err) {
    console.error('Error adding receipt:', err);
    throw err;
  }
}

export async function updateReceipt(rowIndex: number, updates: any) {
  const rowInSheet = rowIndex + 1; // 0-based grid index, +1 to skip the header
  const requests: sheets_v4.Schema$Request[] = [];

  if (updates.category !== undefined) {
    requests.push(setCellRequest(rowInSheet, 4, updates.category)); // Column E
  }
  if (updates.isSubscription !== undefined) {
    requests.push(setCellRequest(rowInSheet, 5, updates.isSubscription)); // Column F
  }
  if (updates.paymentMethod !== undefined) {
    requests.push(setCellRequest(rowInSheet, 7, updates.paymentMethod)); // Column H
  }

  try {
    await runBatch(requests);
  } catch (err) {
    console.error('Error updating receipt:', err);
    throw err;
  }
}

export async function bulkUpdateCategory(rowIndices: number[], category: string) {
  const requests = rowIndices.map(idx => setCellRequest(idx + 1, 4, category));
  try {
    await runBatch(requests);
  } catch (err) {
    console.error('Error bulk updating categories:', err);
    throw err;
  }
}

export async function deleteReceipts(rowIndices: number[]) {
  // Delete bottom-up so earlier indices don't shift.
  const sorted = [...rowIndices].sort((a, b) => b - a);

  const requests: sheets_v4.Schema$Request[] = sorted.map(idx => ({
    deleteDimension: {
      range: {
        sheetId: 0,
        dimension: 'ROWS',
        startIndex: idx + 1, // +1 for header
        endIndex: idx + 2,
      },
    },
  }));

  try {
    await runBatch(requests);
  } catch (err) {
    console.error('Error deleting receipts:', err);
    throw err;
  }
}

export async function renameVendor(oldName: string, newName: string) {
  const sheets = await getSheets();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:M',
    });
    const rows = response.data.values || [];

    const requests: sheets_v4.Schema$Request[] = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] === oldName) {
        requests.push(setCellRequest(i, 1, newName)); // Column B (Vendor)
      }
    }

    await runBatch(requests);
  } catch (err) {
    console.error('Error renaming vendor:', err);
    throw err;
  }
}

export async function updateDescription(rowIndex: number, description: string) {
  try {
    await runBatch([setCellRequest(rowIndex + 1, 12, description)]); // Column M
  } catch (err) {
    console.error('Error updating description:', err);
    throw err;
  }
}
