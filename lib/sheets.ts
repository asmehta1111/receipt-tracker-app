import { google } from 'googleapis';

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID!;

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

export async function getAllReceipts() {
  const sheets = await getSheets();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:M',
    });
    const rows = response.data.values || [];
    if (rows.length === 0) return [];

    const headers = rows[0];
    const data = rows.slice(1).map(row => ({
      date: row[0] || '',
      vendor: row[1] || '',
      currency: row[2] || '',
      amount: parseFloat(row[3]) || 0,
      category: row[4] || '',
      isSubscription: row[5] || '',
      renewalDate: row[6] || '',
      paymentMethod: row[7] || '',
      emailAccount: row[8] || '',
      subject: row[9] || '',
      usdEstimate: parseFloat(row[10]) || 0,
      month: row[11] || '',
      description: row[12] || '',
    }));

    return data;
  } catch (err) {
    console.error('Error fetching receipts:', err);
    return [];
  }
}

export async function addReceipt(receipt: any) {
  const sheets = await getSheets();
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
      `=IF(D${receipt.rowNum}="","",IFERROR(D${receipt.rowNum}*VLOOKUP(C${receipt.rowNum},Summary!$R$2:$S$5,2,FALSE),D${receipt.rowNum}))`,
      `=IF(A${receipt.rowNum}="","",TEXT(A${receipt.rowNum},"YYYY-MM"))`,
    ],
  ];

  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:L',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
    return response;
  } catch (err) {
    console.error('Error adding receipt:', err);
    throw err;
  }
}

export async function updateReceipt(rowIndex: number, updates: any) {
  const sheets = await getSheets();
  const actualRow = rowIndex + 2; // +1 for header, +1 for 1-indexing

  const valuesToUpdate = [];
  const columnsToUpdate = [];

  if (updates.category !== undefined) {
    valuesToUpdate.push(updates.category);
    columnsToUpdate.push(5); // Column E
  }
  if (updates.isSubscription !== undefined) {
    valuesToUpdate.push(updates.isSubscription);
    columnsToUpdate.push(6); // Column F
  }
  if (updates.paymentMethod !== undefined) {
    valuesToUpdate.push(updates.paymentMethod);
    columnsToUpdate.push(8); // Column H
  }

  const requests = valuesToUpdate.map((value, idx) => {
    const colLetter = String.fromCharCode(65 + columnsToUpdate[idx]); // A=65
    return {
      updateCells: {
        range: {
          sheetId: 0,
          rowIndex: actualRow - 1,
          columnIndex: columnsToUpdate[idx],
          endColumnIndex: columnsToUpdate[idx] + 1,
        },
        rows: [
          {
            values: [
              {
                userEnteredValue: value,
              },
            ],
          },
        ],
        fields: 'userEnteredValue',
      },
    };
  });

  if (requests.length > 0) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: { requests },
      });
    } catch (err) {
      console.error('Error updating receipt:', err);
      throw err;
    }
  }
}

export async function bulkUpdateCategory(rowIndices: number[], category: string) {
  const sheets = await getSheets();
  const requests = rowIndices.map(idx => {
    const actualRow = idx + 2;
    return {
      updateCells: {
        range: {
          sheetId: 0,
          rowIndex: actualRow - 1,
          columnIndex: 4, // Column E
          endColumnIndex: 5,
        },
        rows: [
          {
            values: [
              {
                userEnteredValue: category,
              },
            ],
          },
        ],
        fields: 'userEnteredValue',
      },
    };
  });

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { requests },
    });
  } catch (err) {
    console.error('Error bulk updating categories:', err);
    throw err;
  }
}

export async function deleteReceipts(rowIndices: number[]) {
  const sheets = await getSheets();
  // Sort in descending order so row indices don't shift as we delete
  const sortedIndices = rowIndices.sort((a, b) => b - a);

  const requests = sortedIndices.map(idx => ({
    deleteRange: {
      range: {
        sheetId: 0,
        startIndex: idx + 1, // +1 for header
        endIndex: idx + 2,
      },
      shiftDimension: 'ROWS',
    },
  }));

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { requests },
    });
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

    const requests = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] === oldName) {
        requests.push({
          updateCells: {
            range: {
              sheetId: 0,
              rowIndex: i,
              columnIndex: 1, // Column B (Vendor)
              endColumnIndex: 2,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: newName,
                  },
                ],
              },
            ],
            fields: 'userEnteredValue',
          },
        });
      }
    }

    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: { requests },
      });
    }
  } catch (err) {
    console.error('Error renaming vendor:', err);
    throw err;
  }
}

export async function updateDescription(rowIndex: number, description: string) {
  const sheets = await getSheets();
  const actualRow = rowIndex + 2; // +1 for header, +1 for 1-indexing

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: {
        requests: [
          {
            updateCells: {
              range: {
                sheetId: 0,
                rowIndex: actualRow - 1,
                columnIndex: 12, // Column M (Description)
                endColumnIndex: 13,
              },
              rows: [
                {
                  values: [
                    {
                      userEnteredValue: description,
                    },
                  ],
                },
              ],
              fields: 'userEnteredValue',
            },
          },
        ],
      },
    });
  } catch (err) {
    console.error('Error updating description:', err);
    throw err;
  }
}
