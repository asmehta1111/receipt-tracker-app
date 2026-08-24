import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { extractFromUpload, ACCEPTED_TYPES } from '@/lib/receipt-vision';
import { getAllReceipts, vendorKeyFor } from '@/lib/sheets';

// Reading an image takes noticeably longer than any other call this app makes.
// The default 10s would cut it off mid-thought.
export const maxDuration = 60;

// The browser downscales before uploading, so anything above this is either a
// PDF or something that isn't really a receipt.
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Rows already on the Sheet that this upload might be a second copy of. The
 * photographed receipt and the emailed confirmation for the same meal are the
 * commonest case, so match on amount first and use vendor or date only to rank.
 *
 * Deliberately advisory: the caller shows these and lets the human decide. The
 * scraper's dedupe rules exist because automatic merging on amount alone has
 * already merged unrelated rows once.
 */
async function findPossibleDuplicates(draft: { vendor: string; amount: number; transactionDate: string }) {
  if (!draft.amount) return [];
  const all = await getAllReceipts();
  const key = vendorKeyFor(draft.vendor);
  const words = key.split(' ').filter((w) => w.length > 3);

  return all
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => Math.abs(r.amount - draft.amount) < 0.01)
    .map(({ r, i }) => {
      const rKey = vendorKeyFor(r.vendor);
      const sameVendor = rKey === key || words.some((w) => rKey.includes(w));
      const daysApart = draft.transactionDate && r.date
        ? Math.abs(
            (new Date(draft.transactionDate).getTime() - new Date(r.date).getTime()) / 86400000,
          )
        : Infinity;
      return {
        rowIndex: i,
        date: r.date,
        vendor: r.vendor,
        currency: r.currency,
        amount: r.amount,
        category: r.category,
        status: r.status,
        sameVendor,
        daysApart: Number.isFinite(daysApart) ? Math.round(daysApart) : null,
      };
    })
    // Same amount AND (same vendor OR within a fortnight) — a bare amount match
    // across five years of data is noise, not a duplicate.
    .filter((c) => c.sameVendor || (c.daysApart !== null && c.daysApart <= 14))
    .sort((a, b) => Number(b.sameVendor) - Number(a.sameVendor) || (a.daysApart ?? 999) - (b.daysApart ?? 999))
    .slice(0, 5);
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get('file');
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded file.' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'No file was attached.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB.` },
      { status: 400 },
    );
  }

  // Chrome on Android sometimes hands over a share-target file with an empty
  // type. Fall back to the extension before giving up on it.
  let mediaType = file.type;
  if (!ACCEPTED_TYPES.includes(mediaType)) {
    const ext = (file.name || '').toLowerCase().split('.').pop() || '';
    const byExt: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
    };
    if (byExt[ext]) mediaType = byExt[ext];
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const draft = await extractFromUpload(base64, mediaType);

    if (!draft.isReceipt) {
      return NextResponse.json({
        error: "That doesn't look like a receipt, bill or invoice. Try a clearer photo of the printed bill.",
      }, { status: 422 });
    }

    const duplicates = await findPossibleDuplicates(draft);
    return NextResponse.json({ draft, duplicates });
  } catch (err: any) {
    console.error('Upload parse failed:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not read that receipt.' },
      { status: 500 },
    );
  }
}
