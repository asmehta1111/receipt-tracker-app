import { NextRequest, NextResponse } from 'next/server';
import { saveCardCharges, reconcileCharges, CardCharge } from '@/lib/sheets';
import { isAuthenticated } from '@/lib/auth';

/** Splits one CSV line, honouring quoted fields that contain commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/**
 * Amex exports vary by region and by which download option you pick, so columns
 * are located by header name rather than position. Some exports have no header
 * row at all, in which case we fall back to the common Date,Description,Amount
 * ordering.
 */
function parseStatement(csv: string): { charges: CardCharge[]; skipped: number; columns: string[] } {
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { charges: [], skipped: 0, columns: [] };

  const first = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const looksLikeHeader = first.some(h => h.includes('date')) && first.some(h => h.includes('amount') || h.includes('debit'));

  let dateI = 0, descI = 1, amtI = 2, cardI = -1;
  let body = lines;
  if (looksLikeHeader) {
    dateI = first.findIndex(h => h.includes('date'));
    amtI = first.findIndex(h => h.includes('amount') || h.includes('debit'));
    descI = first.findIndex(h => h.includes('description') || h.includes('details') || h.includes('merchant') || h.includes('payee'));
    cardI = first.findIndex(h => h.includes('card member') || h.includes('cardmember') || h.includes('card'));
    if (descI === -1) descI = first.findIndex((_, i) => i !== dateI && i !== amtI);
    body = lines.slice(1);
  }

  const charges: CardCharge[] = [];
  let skipped = 0;
  for (const line of body) {
    const cells = splitCsvLine(line);
    const rawAmount = (cells[amtI] || '').replace(/[^0-9.\-]/g, '');
    const amount = parseFloat(rawAmount);
    const rawDate = cells[dateI] || '';
    const parsed = Date.parse(rawDate);
    if (!Number.isFinite(amount) || amount === 0 || !Number.isFinite(parsed)) { skipped++; continue; }
    charges.push({
      date: new Date(parsed).toISOString().slice(0, 10),
      description: (cells[descI] || '').slice(0, 200),
      amount,
      card: cardI >= 0 ? (cells[cardI] || '').slice(0, 60) : '',
    });
  }
  return { charges, skipped, columns: looksLikeHeader ? splitCsvLine(lines[0]) : [] };
}

export async function GET() {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(await reconcileCharges());
  } catch (err) {
    console.error('Reconcile error:', err);
    return NextResponse.json({ error: 'Failed to reconcile' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { csv } = await request.json();
    if (typeof csv !== 'string' || !csv.trim()) {
      return NextResponse.json({ error: 'No CSV content received' }, { status: 400 });
    }

    const { charges, skipped, columns } = parseStatement(csv);
    if (!charges.length) {
      return NextResponse.json({
        error: 'No usable rows found. Expected columns for date, description and amount.',
        columns,
      }, { status: 400 });
    }

    await saveCardCharges(charges);
    const report = await reconcileCharges();
    return NextResponse.json({ success: true, imported: charges.length, skipped, columns, ...report });
  } catch (err) {
    console.error('Statement import error:', err);
    return NextResponse.json({ error: 'Failed to import statement' }, { status: 500 });
  }
}
