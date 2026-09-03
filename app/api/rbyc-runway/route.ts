import { NextRequest, NextResponse } from 'next/server';
import { getSheets } from '@/lib/sheets';

// Machine-to-machine endpoint for the monthly RBYC top-up check (a scheduled
// cloud routine calls this, not a browser). Auth is a static key, not the
// app's session cookie — there's no interactive login in a cron context.
// Separate from APP_PASSWORD so the two can be rotated independently.
const RBYC_SHEET_ID = process.env.RBYC_SHEET_ID;
const CHECK_SECRET = process.env.RBYC_CHECK_SECRET;

// Same methodology as the "Runway at current balance" tile on the RBYC
// Billing artifact: trailing 6 months' average debit against the latest
// statement's balance. Keep these in sync if either one changes.
const RUNWAY_TRAILING_N = 6;
const RUNWAY_WARN_MONTHS = 1.5;

function untilLabel(fromPeriod: string, monthsAhead: number) {
  const [y, m] = fromPeriod.split('-').map(Number);
  const start = new Date(Date.UTC(y, m, 1)); // first of the month AFTER fromPeriod
  const target = new Date(start.getTime() + monthsAhead * 30.44 * 86400000);
  return target.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export async function GET(request: NextRequest) {
  if (!CHECK_SECRET) {
    return NextResponse.json({ error: 'RBYC_CHECK_SECRET not configured' }, { status: 500 });
  }
  const key = request.nextUrl.searchParams.get('key') || request.headers.get('x-rbyc-key');
  if (key !== CHECK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!RBYC_SHEET_ID) {
    return NextResponse.json({ error: 'RBYC_SHEET_ID not configured' }, { status: 500 });
  }

  try {
    const sheets = await getSheets();
    const batch = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: RBYC_SHEET_ID,
      ranges: [
        'Summary!A5:K1000', // row 4 is the header; data starts row 5
        'Advance Payments!A2:C1000', // Date, Vendor, Amount — row 1 is the header
      ],
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    const [summaryRange, advanceRange] = batch.data.valueRanges || [];
    const rows = (summaryRange?.values || []).filter(r => r[0]); // drop trailing blanks
    if (!rows.length) {
      return NextResponse.json({ error: 'No rows found in Summary tab' }, { status: 502 });
    }

    const last = rows[rows.length - 1];
    const period = String(last[0]);
    const amountDue = last[10] === '' || last[10] == null ? null : Number(last[10]);

    const recent = rows.slice(-RUNWAY_TRAILING_N);
    const avgRecent = recent.reduce((a, r) => a + (Number(r[6]) || 0), 0) / recent.length;

    if (amountDue === null) {
      return NextResponse.json({
        period, amountDue: null, avgRecent: Math.round(avgRecent),
        runwayMonths: null, inCredit: null, needsTopUp: false,
        note: 'Latest statement has no balance figure — cannot compute runway.',
      });
    }

    // Advance payments dated after the latest statement's coverage haven't been
    // folded into any invoice's balance yet — the Summary tab only updates when
    // someone rebuilds it from a new PDF. Fold them in here so the runway number
    // doesn't understate a top-up you already made. A payment IS reflected once a
    // later statement exists, so only count ones after the month following the
    // latest period (e.g. period 2026-07 -> only payments from 2026-08 onward).
    const [py, pm] = period.split('-').map(Number);
    const reflectedThrough = `${pm === 12 ? py + 1 : py}-${String(pm === 12 ? 1 : pm + 1).padStart(2, '0')}`;
    const advanceRows = advanceRange?.values || [];
    const unreflectedPayments = advanceRows
      .filter(r => r[0] && String(r[0]).slice(0, 7) >= reflectedThrough)
      .reduce((a, r) => a + (Number(r[2]) || 0), 0);

    const adjustedAmountDue = amountDue - unreflectedPayments;
    const inCredit = adjustedAmountDue < 0;
    const runwayMonths = inCredit ? Math.abs(adjustedAmountDue) / avgRecent : 0;
    const needsTopUp = !inCredit || runwayMonths < RUNWAY_WARN_MONTHS;

    // This Summary tab is a one-time build from Gmail PDFs, not a live sync — a new
    // invoice only appears here if someone re-runs the build script. A normal invoice
    // lag is about one month behind "now"; more than that means the sheet itself has
    // gone stale, and the runway figure below is computed from an old statement.
    const now = new Date();
    const monthsBehind = (now.getUTCFullYear() - py) * 12 + (now.getUTCMonth() + 1 - pm);
    const stale = monthsBehind > 2;

    return NextResponse.json({
      period,
      amountDue: Math.round(amountDue * 100) / 100,
      unreflectedPayments: Math.round(unreflectedPayments * 100) / 100,
      adjustedAmountDue: Math.round(adjustedAmountDue * 100) / 100,
      avgRecent: Math.round(avgRecent),
      inCredit,
      runwayMonths: Math.round(runwayMonths * 10) / 10,
      until: inCredit ? untilLabel(period, runwayMonths) : null,
      needsTopUp,
      stale,
      monthsBehind,
    });
  } catch (err) {
    console.error('RBYC runway check error:', err);
    return NextResponse.json({ error: 'Failed to compute runway' }, { status: 500 });
  }
}
