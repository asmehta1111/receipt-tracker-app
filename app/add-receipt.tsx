'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, X, AlertTriangle, Check, Loader2, RotateCcw } from 'lucide-react';

// Must stay in step with CATEGORIES in lib/sheets.ts. Duplicated rather than
// imported because lib/sheets.ts pulls in googleapis, which cannot be bundled
// into a client component.
const CATEGORIES_CLIENT = [
  'Airlines', 'Hotels', 'Travel', 'Transportation', 'Food', 'Groceries', 'Media',
  'IT', 'Website', 'Telecom', 'Utilities', 'Insurance', 'Financial Services',
  'Professional Services', 'Shopping', 'Health', 'Education', 'Clubs & Memberships',
  'Investments', 'Card Payments', 'Internal Transfers', 'Business (BLIF/AMA)',
  'Real estate', 'Family Loan', 'Rent', 'Home Employees', 'Donation', 'Legal',
  'Conference', 'Other',
];
const HOUSEHOLD = ['Me', 'Nilza', 'Ariana', 'Aalia', 'Aaryan', 'Arvaan', 'Family'];
const NON_HOUSEHOLD = ['Brother', 'Parents', 'Someone else'];
const VOID_STATUSES = ['Refunded', 'Cancelled', 'Failed', 'Duplicate', 'Void'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CHF', 'JPY', 'AUD', 'CAD'];

// A modern phone camera produces a 4–8 MB JPEG. None of that resolution helps
// Claude read a till roll, and on mobile data the upload is the slowest part of
// the whole round trip, so shrink before sending. 1600px on the long edge still
// resolves small print comfortably.
const MAX_EDGE = 1600;

async function downscale(file: File): Promise<{ blob: Blob; type: string }> {
  if (file.type === 'application/pdf') return { blob: file, type: 'application/pdf' };
  if (!file.type.startsWith('image/')) return { blob: file, type: file.type };

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Already small enough and already a format Claude accepts — leave it be.
    if (scale === 1 && file.size < 2_000_000 && file.type === 'image/jpeg') {
      return { blob: file, type: file.type };
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: file, type: file.type };
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, 'image/jpeg', 0.85),
    );
    return blob ? { blob, type: 'image/jpeg' } : { blob: file, type: file.type };
  } catch {
    // createImageBitmap refuses HEIC and a few exotic formats. Send the original
    // and let the server produce the specific error message.
    return { blob: file, type: file.type };
  }
}

type Draft = {
  vendor: string; currency: string; amount: number; category: string;
  isSubscription: boolean; renewalDate: string; paymentMethod: string;
  transactionDate: string; description: string;
  transactionType: string; confident: boolean;
  unreadable: string[]; warnings: string[];
};

type Row = {
  date: string; vendor: string; currency: string; amount: string;
  category: string; isSubscription: boolean; renewalDate: string;
  paymentMethod: string; description: string; subject: string;
  status: string; person: string;
};

// The scraper records what actually happened to the money as a transaction
// type; the Sheet records it as a status in column O. Same idea, different
// vocabulary, so translate rather than making the human do it.
const TYPE_TO_STATUS: Record<string, string> = {
  refund: 'Refunded', cancellation: 'Cancelled', failed: 'Failed',
};

function draftToRow(d: Draft): Row {
  return {
    date: d.transactionDate || '',
    vendor: d.vendor || '',
    currency: d.currency || 'INR',
    amount: d.amount ? String(d.amount) : '',
    category: d.category || 'Other',
    isSubscription: !!d.isSubscription,
    renewalDate: d.renewalDate || '',
    paymentMethod: d.paymentMethod || '',
    description: d.description || '',
    subject: '',
    status: TYPE_TO_STATUS[d.transactionType] || '',
    person: '',
  };
}

export default function AddReceipt({
  onSaved, inUseCategories = [],
}: { onSaved: () => void; inUseCategories?: string[] }) {
  // The Sheet carries categories the canonical list has never heard of, because
  // category-overrides.json lets a one-off answer invent one — "Jeralyn" is 12
  // rows and $85,550 of it. Offering only the canonical thirty would make those
  // unreachable from here, so merge in whatever the Sheet actually uses.
  const categories = Array.from(new Set([...CATEGORIES_CLIENT, ...inUseCategories]))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [row, setRow] = useState<Row | null>(null);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [savedMsg, setSavedMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPreview((p) => { if (p) URL.revokeObjectURL(p); return null; });
    setFileName(''); setDraft(null); setRow(null);
    setDuplicates([]); setError(''); setSavedMsg('');
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(''); setSavedMsg(''); setDraft(null); setRow(null); setDuplicates([]);
    setFileName(file.name || 'receipt');
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    });
    setParsing(true);
    try {
      const { blob, type } = await downscale(file);
      const form = new FormData();
      form.append('file', new File([blob], file.name || 'receipt', { type }));
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Could not read that receipt.'); return; }
      setDraft(json.draft);
      setRow(draftToRow(json.draft));
      setDuplicates(json.duplicates || []);
    } catch (e: any) {
      setError(e?.message || 'Upload failed.');
    } finally {
      setParsing(false);
    }
  }, []);

  // Android share-target hand-off. The service worker stashes the shared image
  // in Cache Storage and redirects here, because a POST navigation cannot carry
  // a file into React any other way.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shared = new URLSearchParams(window.location.search).get('shared');
    if (!shared) return;
    if (shared === 'failed') {
      setError('The shared image did not come through. Try picking it here instead.');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    (async () => {
      try {
        const cache = await caches.open('shared-receipt');
        const stashed = await cache.match('/shared-file');
        if (!stashed) {
          setError('The shared image had already been used up. Pick it here instead.');
          return;
        }
        const blob = await stashed.blob();
        await cache.delete('/shared-file');
        const type = stashed.headers.get('x-file-type') || blob.type || 'image/jpeg';
        const name = stashed.headers.get('x-file-name') || 'shared-receipt.jpg';
        handleFile(new File([blob], name, { type }));
      } catch {
        setError('Could not pick up the shared image.');
      } finally {
        window.history.replaceState({}, '', window.location.pathname);
      }
    })();
  }, [handleFile]);

  async function save() {
    if (!row) return;
    if (!row.vendor.trim()) { setError('Vendor is required.'); return; }
    const amount = parseFloat(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid amount.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          data: {
            date: row.date, vendor: row.vendor.trim(), currency: row.currency,
            amount, category: row.category, isSubscription: row.isSubscription,
            renewalDate: row.renewalDate, paymentMethod: row.paymentMethod,
            subject: row.subject || `Photo: ${fileName}`,
            description: row.description, status: row.status, person: row.person,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Save failed.'); return; }
      const saved = `${row.vendor.trim()} — ${row.currency} ${amount.toLocaleString()}`;
      reset();
      setSavedMsg(`Saved ${saved} to the Sheet.`);
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof Row, v: any) => setRow((r) => (r ? { ...r, [k]: v } : r));
  const flagged = (f: string) => draft?.unreadable?.includes(f);

  // Fields Claude could not read get an amber ring AND the words "couldn't
  // read" — never colour alone.
  const inputClass = (field?: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
      field && flagged(field) ? 'border-orange-500 ring-1 ring-orange-300 bg-orange-50' : 'border-gray-300'
    }`;

  const label = (text: string, field?: string) => (
    <label className="block text-xs font-semibold text-gray-600 mb-1">
      {text}
      {field && flagged(field) && (
        <span className="ml-2 font-normal text-orange-700">couldn&apos;t read — check</span>
      )}
    </label>
  );

  return (
    <div className="max-w-3xl">
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-1">Add a receipt from a photo</h2>
        <p className="text-sm text-gray-600 mb-4">
          Photograph the bill, or pick one from Google Photos. Claude reads it, you check it, then it goes to the Sheet.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {!draft && !parsing && (
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl py-12 hover:border-indigo-500 hover:bg-indigo-50 transition flex flex-col items-center gap-2 text-gray-600"
          >
            <Upload size={32} />
            <span className="font-medium">Choose a photo or PDF</span>
            <span className="text-xs">JPEG, PNG, WebP or PDF — up to 8 MB</span>
          </button>
        )}

        {parsing && (
          <div className="border rounded-xl py-12 flex flex-col items-center gap-3 text-gray-600">
            <Loader2 size={32} className="animate-spin text-indigo-600" />
            <span className="font-medium">Reading {fileName}…</span>
            <span className="text-xs">Usually 10–20 seconds</span>
          </div>
        )}

        {savedMsg && (
          <div className="mt-4 flex items-start gap-2 bg-teal-50 border border-teal-600 rounded-lg p-3">
            <Check size={18} className="text-teal-700 mt-0.5 shrink-0" />
            <div className="text-sm text-teal-900">
              <div className="font-semibold">Saved</div>
              <div>{savedMsg}</div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 bg-rose-50 border border-rose-600 rounded-lg p-3">
            <AlertTriangle size={18} className="text-rose-700 mt-0.5 shrink-0" />
            <div className="text-sm text-rose-900 flex-1">
              <div className="font-semibold">Couldn&apos;t do that</div>
              <div>{error}</div>
            </div>
            <button onClick={() => setError('')} className="text-rose-700"><X size={16} /></button>
          </div>
        )}

        {row && draft && (
          <div className="mt-2">
            <div className="flex items-start gap-4 mb-4">
              {preview && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={preview} alt="Uploaded receipt" className="w-28 h-36 object-cover rounded-lg border shrink-0" />
              )}
              <div className="flex-1 space-y-2">
                {!draft.confident && (
                  <div className="flex items-start gap-2 bg-orange-50 border border-orange-500 rounded-lg p-2.5 text-sm text-orange-900">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>Claude wasn&apos;t confident about this one — check every field before saving.</span>
                  </div>
                )}
                {draft.warnings?.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 bg-orange-50 border border-orange-400 rounded-lg p-2.5 text-sm text-orange-900">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
                <button onClick={reset} className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1.5">
                  <RotateCcw size={14} /> Use a different photo
                </button>
              </div>
            </div>

            {duplicates.length > 0 && (
              <div className="mb-4 bg-rose-50 border border-rose-600 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-rose-900 mb-2">
                  <AlertTriangle size={16} />
                  Possible duplicate — {duplicates.length} row{duplicates.length > 1 ? 's' : ''} already on the Sheet for this amount
                </div>
                <div className="space-y-1">
                  {duplicates.map((d, i) => (
                    <div key={i} className="text-sm text-rose-900 flex flex-wrap gap-x-3">
                      <span className="font-medium">{d.vendor}</span>
                      <span>{d.currency} {Number(d.amount).toLocaleString()}</span>
                      <span>{d.date}</span>
                      <span className="text-rose-700">
                        {d.sameVendor ? 'same vendor' : `${d.daysApart} days apart`}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-rose-800 mt-2">
                  If this photo is the same charge as one of those, set Status to Duplicate below, or use a different photo.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                {label('Vendor', 'vendor')}
                <input className={inputClass('vendor')} value={row.vendor}
                  onChange={(e) => set('vendor', e.target.value)} />
              </div>
              <div>
                {label('Date', 'date')}
                <input type="date" className={inputClass('date')} value={row.date}
                  onChange={(e) => set('date', e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  {label('Currency', 'currency')}
                  <select className={inputClass('currency')} value={row.currency}
                    onChange={(e) => set('currency', e.target.value)}>
                    {(CURRENCIES.includes(row.currency) ? CURRENCIES : [row.currency, ...CURRENCIES])
                      .map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  {label('Amount', 'amount')}
                  <input type="number" step="0.01" inputMode="decimal" className={inputClass('amount')}
                    value={row.amount} onChange={(e) => set('amount', e.target.value)} />
                </div>
              </div>
              <div>
                {label('Category')}
                <select className={inputClass()} value={row.category}
                  onChange={(e) => set('category', e.target.value)}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                {label('Payment method', 'paymentMethod')}
                <input className={inputClass('paymentMethod')} value={row.paymentMethod}
                  onChange={(e) => set('paymentMethod', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                {label('Description')}
                <input className={inputClass()} value={row.description}
                  onChange={(e) => set('description', e.target.value)} />
              </div>

              <div className="sm:col-span-2">
                {label('Who was this for?')}
                <div className="flex flex-wrap gap-1.5">
                  {[...HOUSEHOLD, ...NON_HOUSEHOLD].map((p) => (
                    <button key={p} type="button" onClick={() => set('person', row.person === p ? '' : p)}
                      className={`px-2.5 py-1 rounded-full text-sm border transition ${
                        row.person === p
                          ? NON_HOUSEHOLD.includes(p)
                            ? 'bg-rose-700 text-white border-rose-700'
                            : 'bg-indigo-700 text-white border-indigo-700'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                      }`}>
                      {p}{NON_HOUSEHOLD.includes(p) ? ' (excluded)' : ''}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                {label('Status')}
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => set('status', '')}
                    className={`px-2.5 py-1 rounded-full text-sm border transition ${
                      !row.status ? 'bg-teal-700 text-white border-teal-700'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                    }`}>
                    Counts as spend
                  </button>
                  {VOID_STATUSES.map((s) => (
                    <button key={s} type="button" onClick={() => set('status', s)}
                      className={`px-2.5 py-1 rounded-full text-sm border transition ${
                        row.status === s ? 'bg-orange-600 text-white border-orange-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                      }`}>
                      {s} (excluded)
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-2 flex items-center gap-2">
                <input id="isSub" type="checkbox" checked={row.isSubscription}
                  onChange={(e) => set('isSubscription', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300" />
                <label htmlFor="isSub" className="text-sm text-gray-700">Recurring subscription or membership</label>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button onClick={save} disabled={saving}
                className="bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-800 disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {saving ? 'Saving…' : 'Save to Sheet'}
              </button>
              <button onClick={reset} className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
