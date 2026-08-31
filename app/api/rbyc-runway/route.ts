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
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: RBYC_SHEET_ID,
      range: 'Summary!A5:K1000', // row 4 is the header; data starts row 5
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    const rows = (res.data.values || []).filter(r => r[0]); // drop trailing blanks
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

    const inCredit = amountDue < 0;
    const runwayMonths = inCredit ? Math.abs(amountDue) / avgRecent : 0;
    const needsTopUp = !inCredit || runwayMonths < RUNWAY_WARN_MONTHS;

    return NextResponse.json({
      period,
      amountDue: Math.round(amountDue * 100) / 100,
      avgRecent: Math.round(avgRecent),
      inCredit,
      runwayMonths: Math.round(runwayMonths * 10) / 10,
      until: inCredit ? untilLabel(period, runwayMonths) : null,
      needsTopUp,
    });
  } catch (err) {
    console.error('RBYC runway check error:', err);
    return NextResponse.json({ error: 'Failed to compute runway' }, { status: 500 });
  }
}
