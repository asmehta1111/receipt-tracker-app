import { google, sheets_v4 } from 'googleapis';

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID!;

// Capital flows for the investment business — fund subscriptions, warrant
// subscriptions, deal payments. Real transactions, but not expenses, so they
// are kept in the Sheet and left out of every spend total.
export const NON_EXPENSE_CATEGORIES = ['Investments'];

export function isExpense(r: { category?: string }) {
  return !NON_EXPENSE_CATEGORIES.includes(r.category || '');
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
