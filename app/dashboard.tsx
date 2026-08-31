'use client';

// Force rebuild
import { useState, useEffect, Fragment } from 'react';
import { PieChart, Pie, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { LogOut, Plus, Edit2, Trash2, Filter, Search, X, Camera, Mail } from 'lucide-react';
import AddReceipt from './add-receipt';

// Deep, high-saturation hues that stay distinguishable with red-green colour
// vision deficiency — blue / indigo / teal / orange / rose, never two neighbours.
const VOID_STATUSES_CLIENT = ['Refunded', 'Cancelled', 'Failed', 'Duplicate', 'Void'];
const NON_HOUSEHOLD_CLIENT = ['Brother', 'Parents', 'Someone else'];

const COLORS = ['#1D4ED8', '#0F766E', '#EA580C', '#BE123C', '#6D28D9', '#0369A1',
                '#A16207', '#9F1239', '#4338CA', '#115E59'];

export default function Dashboard() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Which year in the year-by-year panel is opened out. One at a time — the
  // point of the panel is comparing years, and several expanded at once buries
  // the comparison under its own detail.
  const [openYear, setOpenYear] = useState<string | null>(null);
  // Arriving from the Android share sheet means a photo is already waiting in
  // Cache Storage, so land on Add rather than making the user find the tab.
  const [activeTab, setActiveTab] = useState(() =>
    typeof window !== 'undefined' && window.location.search.includes('shared')
      ? 'add' : 'dashboard');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filterCategory, setFilterCategory] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [renameModal, setRenameModal] = useState<{ oldName: string; newName: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [descriptionModal, setDescriptionModal] = useState<{ rowIndex: number; description: string } | null>(null);
  const [savingDescription, setSavingDescription] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [savingVendor, setSavingVendor] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<Record<string, string>>({});
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openVendors, setOpenVendors] = useState<Set<string>>(new Set());
  const [breakdownScope, setBreakdownScope] = useState<'expenses' | 'excluded' | 'all'>('expenses');
  const [duplicates, setDuplicates] = useState<any>(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [dismissedGroups, setDismissedGroups] = useState<Set<string>>(new Set());
  const [filterYear, setFilterYear] = useState('');
  const [breakdownYear, setBreakdownYear] = useState('');
  const [showExcluded, setShowExcluded] = useState(false);
  const [savingPerson, setSavingPerson] = useState<string | null>(null);
  const [reconcile, setReconcile] = useState<any>(null);
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [reconcileError, setReconcileError] = useState('');
  const [reconcileSide, setReconcileSide] = useState<'chargesNoReceipt' | 'receiptsNoCharge'>('chargesNoReceipt');
  const [travelFilter, setTravelFilter] = useState<'unassigned' | 'all'>('unassigned');
  const [travelView, setTravelView] = useState<'trips' | 'items'>('trips');
  const [travelSearch, setTravelSearch] = useState('');
  const [openTrips, setOpenTrips] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  useEffect(() => {
    fetchData();
    fetchReviewQueue();
  }, []);

  // Clicking anything on the dashboard should show the rows behind the number.
  function drillIntoCategory(category: string) {
    setFilterCategory(category);
    setSearchQuery('');
    setActiveTab('receipts');
    window.scrollTo({ top: 0 });
  }

  function drillIntoVendor(vendor: string) {
    setFilterCategory('');
    setSearchQuery(vendor);
    setActiveTab('receipts');
    window.scrollTo({ top: 0 });
  }

  function drillIntoYear(year: string) {
    setFilterCategory('');
    setSearchQuery('');
    setFilterYear(year);
    setActiveTab('receipts');
    window.scrollTo({ top: 0 });
  }

  // Every scraped row carries the Gmail thread it came from. Linking straight
  // to that thread is more reliable than any field we could extract from it —
  // it shows the actual PNR, passenger names, price breakdown and any attached
  // receipt/PDF exactly as the vendor sent it, for self-auditing an amount.
  function gmailSourceLink(receipt: { threadId?: string; emailAccount?: string }) {
    if (!receipt.threadId) return null;
    const authuser = receipt.emailAccount ? `?authuser=${encodeURIComponent(receipt.emailAccount)}` : '';
    return `https://mail.google.com/mail/${authuser}#all/${receipt.threadId}`;
  }

  // Household counts as ASM's spending; anyone else does not, even when the
  // booking is under his name. ASM: "only me, nilza, ariana, aalia, aaryan and arvaan".
  const HOUSEHOLD = ['Me', 'Nilza', 'Ariana', 'Aalia', 'Aaryan', 'Arvaan', 'Family'];
  const NON_HOUSEHOLD = ['Brother', 'Parents', 'Someone else'];
  const PEOPLE = [...HOUSEHOLD, ...NON_HOUSEHOLD];

  // Travel booked under ASM's name is often for someone else. Assigning it is a
  // judgement call he makes from the route and dates, so the screen leads with
  // the description rather than the subject line.
  async function handleSetPerson(rowIndices: number[], person: string) {
    setSavingPerson(rowIndices.join(','));
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setPerson', data: { rowIndices, person } }),
      });
      if (res.ok) {
        setReceipts(prev => prev.map((r, i) => rowIndices.includes(i) ? { ...r, person } : r));
        setSelectedRows(new Set());
      }
    } catch (err) {
      console.error('Failed to set person:', err);
    } finally {
      setSavingPerson(null);
    }
  }

  // Marks specific rows (not the checkbox selection) as money that never left —
  // a trip that was cancelled after booking. The card then drops out of the
  // travel list, since voided rows aren't spend and don't need attributing.
  async function handleSetStatusRows(rowIndices: number[], status: string) {
    setSavingPerson(rowIndices.join(','));
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setStatus', data: { rowIndices, status } }),
      });
      if (res.ok) {
        setReceipts(prev => prev.map((r, i) => rowIndices.includes(i) ? { ...r, status } : r));
        fetchData();
      }
    } catch (err) {
      console.error('Failed to set status:', err);
    } finally {
      setSavingPerson(null);
    }
  }

  async function fetchReconcile() {
    setReconcileBusy(true);
    try {
      const res = await fetch('/api/reconcile');
      if (res.ok) setReconcile(await res.json());
    } catch (err) {
      console.error('Failed to load reconciliation:', err);
    } finally {
      setReconcileBusy(false);
    }
  }

  // The CSV never leaves for anywhere except this app's own API — it is parsed
  // server-side and stored on the same Sheet as everything else.
  async function handleStatementUpload(file: File) {
    setReconcileBusy(true);
    setReconcileError('');
    try {
      const csv = await file.text();
      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) { setReconcileError(data.error || 'Import failed'); return; }
      setReconcile(data);
    } catch (err) {
      setReconcileError('Could not read that file');
    } finally {
      setReconcileBusy(false);
    }
  }

  async function fetchDuplicates() {
    setDupLoading(true);
    try {
      const res = await fetch('/api/duplicates');
      if (res.ok) setDuplicates(await res.json());
    } catch (err) {
      console.error('Failed to load duplicates:', err);
    } finally {
      setDupLoading(false);
    }
  }

  // Keeps the first row of a group and deletes the rest.
  async function handleMergeGroup(group: any) {
    setMergingKey(group.key);
    try {
      const toDelete = group.rows.slice(1).map((r: any) => r.rowIndex);
      const res = await fetch('/api/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndices: toDelete }),
      });
      if (res.ok) {
        setDismissedGroups(prev => new Set(prev).add(group.key));
        fetchData();
        // Row indices shift after a delete, so the list must be rebuilt.
        fetchDuplicates();
      }
    } catch (err) {
      console.error('Failed to merge:', err);
    } finally {
      setMergingKey(null);
    }
  }

  async function fetchReviewQueue() {
    setReviewLoading(true);
    try {
      const res = await fetch('/api/review');
      if (res.ok) setReviewQueue(await res.json());
    } catch (err) {
      console.error('Failed to load review queue:', err);
    } finally {
      setReviewLoading(false);
    }
  }

  // Applies a category to every unclassified row for this vendor and records the
  // decision so the next scrape uses it instead of guessing again.
  async function handleClassifyVendor(vendorKey: string, category: string) {
    setSavingVendor(vendorKey);
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorKey, category }),
      });
      if (res.ok) {
        setJustSaved(prev => ({ ...prev, [vendorKey]: category }));
        setReviewQueue((prev: any) => ({
          ...prev,
          vendors: prev.vendors.filter((v: any) => v.vendorKey !== vendorKey),
        }));
        fetchData(); // totals and charts shift as things leave "Other"
      }
    } catch (err) {
      console.error('Failed to classify vendor:', err);
    } finally {
      setSavingVendor(null);
    }
  }

  async function fetchData() {
    try {
      const [receiptsRes, analyticsRes] = await Promise.all([
        fetch('/api/receipts'),
        fetch('/api/analytics'),
      ]);

      const receiptsData = await receiptsRes.json();
      const analyticsData = await analyticsRes.json();

      setReceipts(Array.isArray(receiptsData) ? receiptsData : []);
      setAnalytics(analyticsData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }

  // Marks the selected receipts as money that never actually left — a refunded
  // flight, a cancelled booking, a failed payment. Empty string undoes it.
  async function handleSetStatus(status: string) {
    if (selectedRows.size === 0) return;
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setStatus',
          data: { rowIndices: Array.from(selectedRows), status },
        }),
      });
      if (res.ok) {
        setSelectedRows(new Set());
        fetchData();
      }
    } catch (err) {
      console.error('Failed to set status:', err);
    }
  }

  async function handleBulkUpdateCategory() {
    if (selectedRows.size === 0 || !bulkCategory) return;

    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulkUpdateCategory',
          data: { rowIndices: Array.from(selectedRows), category: bulkCategory },
        }),
      });

      if (res.ok) {
        setSelectedRows(new Set());
        setBulkCategory('');
        fetchData();
      }
    } catch (err) {
      console.error('Error updating categories:', err);
    }
  }

  async function handleLogout() {
    document.cookie = 'auth=; max-age=0; path=/';
    window.location.reload();
  }

  async function handleRenameVendor() {
    if (!renameModal || !renameModal.newName.trim()) return;

    setRenaming(true);
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'renameVendor',
          data: { oldName: renameModal.oldName, newName: renameModal.newName },
        }),
      });

      if (res.ok) {
        setRenameModal(null);
        fetchData();
      }
    } catch (err) {
      console.error('Error renaming vendor:', err);
    } finally {
      setRenaming(false);
    }
  }

  async function handleSaveDescription() {
    if (!descriptionModal) return;

    setSavingDescription(true);
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateDescription',
          data: { rowIndex: descriptionModal.rowIndex, description: descriptionModal.description },
        }),
      });

      if (res.ok) {
        setDescriptionModal(null);
        fetchData();
      }
    } catch (err) {
      console.error('Error saving description:', err);
    } finally {
      setSavingDescription(false);
    }
  }

  const yearOf = (r: any) => String(r.date || '').slice(0, 4);

  // Claude names the same vendor differently on different emails, so totals get
  // split. These merge the ones that matter. Deliberately explicit rather than
  // fuzzy: matching on the first word would fold "United Help Ukraine" (a
  // donation) into United Airlines, and "Deutsche Bahn" into the school.
  const VENDOR_ALIASES: [RegExp, string][] = [
    [/^(rbyc\b|royal bombay)/i, 'Royal Bombay Yacht Club'],
    // The kids' school, the German school in Bombay. Claude has guessed "Delhi
    // School of Business", "Delhi Public School", "DSB India" and "dsbindia" —
    // fourteen spellings, all one place. Matched on the full distinguishing
    // phrase, never a first word: "Deutsches Museum" and "Deutsche Bahn" open
    // the same way and are not the school.
    [/^(dsb\b|dsbindia|delhi school of business|delhi public school|deutsche[rs]? schulverein|deutsche schule bombay)/i,
      'Deutsche Schulverein Bombay'],
    [/^united airlines/i, 'United Airlines'],
    [/^american airlines/i, 'American Airlines'],
    [/^marriott\b/i, 'Marriott Hotels'],
    [/^jw marriott/i, 'JW Marriott'],
    [/^w hotels|^w$/i, 'W Hotels'],
    [/^(india )?income tax/i, 'Income Tax Department'],
    [/^kotak/i, 'Kotak Mahindra Bank'],
    [/^shady grove/i, 'Shady Grove Fertility'],
    [/^swiss/i, 'SWISS'],
    [/^singapore airlines/i, 'Singapore Airlines'],
    [/^(morgan,? lewis)/i, 'Morgan Lewis'],
    [/^surrogatefirst/i, 'SurrogateFirst'],
  ];

  const canonicalVendor = (vendor: string) => {
    const v = String(vendor || '').trim();
    for (const [re, name] of VENDOR_ALIASES) if (re.test(v)) return name;
    return v || '(no vendor)';
  };

  // Parent companies. JW Marriott, Sheraton, W and St. Regis are all Marriott —
  // useful summed for negotiating or points, useful separate for seeing which
  // property. The table shows both: family total, expandable to the brands.
  const VENDOR_GROUPS: [RegExp, string][] = [
    [/marriott|sheraton|westin|st\.? ?regis|^w hotels|delta hotels|^element|tribute portfolio|ritz.?carlton|^aloft|four points|courtyard|fairfield|^moxy|^ac hotels|le m[eé]ridien|autograph|luxury collection|renaissance (hotel|.*resort)/i, 'Marriott group'],
    [/hilton|doubletree|hampton inn|embassy suites|waldorf|conrad |curio |canopy by/i, 'Hilton group'],
    [/intercontinental|holiday inn|crowne plaza|kimpton|hotel indigo|staybridge|candlewood/i, 'IHG group'],
    [/hyatt|andaz|thompson hotels|^alila/i, 'Hyatt group'],
    [/accor|sofitel|novotel|pullman|fairmont|raffles|swiss[oô]tel|mercure|^ibis/i, 'Accor group'],
    [/^taj |taj hotels|ihcl|vivanta|seleqtions/i, 'Taj / IHCL'],
    [/^google/i, 'Google'],
    [/^amazon/i, 'Amazon'],
    [/^(dsb|deutscher schulverein|delhi school of business|delhi public school)/i, 'DSB (Deutsche Schule Bombay)'],
  ];

  const vendorGroupOf = (canonical: string) => {
    for (const [re, name] of VENDOR_GROUPS) if (re.test(canonical)) return name;
    return null; // ungrouped vendors stand alone
  };

  const filteredReceipts = receipts.filter(r => {
    const matchesCategory = !filterCategory || r.category === filterCategory;
    const matchesYear = !filterYear || yearOf(r) === filterYear;
    const matchesSearch = !searchQuery ||
      r.vendor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.date.includes(searchQuery) ||
      r.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesYear && matchesSearch;
  });

  const categories = [...new Set(receipts.map(r => r.category).filter(Boolean))];

  // Declared before travelRows and breakdown, both of which read it — a const
  // used above its declaration throws at render time, not at build time.
  const nonExpense: string[] = analytics?.nonExpenseCategories || [];

  const TRAVEL_CATEGORIES = ['Airlines', 'Hotels', 'Travel', 'Transportation'];
  const allTravelRows = receipts
    .map((r, i) => ({ ...r, idx: i }))
    .filter(r => TRAVEL_CATEGORIES.includes(r.category)
      && !VOID_STATUSES_CLIENT.includes(r.status || '')
      && !nonExpense.includes(r.category));
  // Name, route, vendor or date — whatever's on screen for a trip, so a search
  // narrows the same 80/150-row-capped lists below instead of only scrolling them.
  const travelRows = !travelSearch ? allTravelRows : allTravelRows.filter(r => {
    const q = travelSearch.toLowerCase();
    return r.vendor.toLowerCase().includes(q)
      || (r.description || '').toLowerCase().includes(q)
      || (r.subject || '').toLowerCase().includes(q)
      || (r.person || '').toLowerCase().includes(q)
      || r.date.includes(travelSearch);
  });
  const unassignedTravel = travelRows.filter(r => !r.person);

  // Flights and hotels a few days apart are almost always one trip for the same
  // people, so they can be assigned together. A row joins the current trip if it
  // starts within GAP days of the last row in it — that chains a two-week trip
  // correctly while still breaking between separate journeys.
  const TRIP_GAP_DAYS = 5;
  const tripsOf = (rows: any[]) => {
    const dated = rows
      .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
      .sort((a, b) => a.date.localeCompare(b.date));
    const out: any[] = [];
    for (const r of dated) {
      const last = out[out.length - 1];
      const d = Date.parse(r.date) / 86400000;
      if (last && d - last.endDay <= TRIP_GAP_DAYS) {
        last.rows.push(r);
        last.endDay = Math.max(last.endDay, d);
        last.end = r.date;
      } else {
        out.push({ rows: [r], start: r.date, end: r.date, endDay: d });
      }
    }
    return out
      .map(t => ({
        ...t,
        key: t.start + '|' + t.rows.length,
        total: t.rows.reduce((s: number, r: any) => s + (r.usdEstimate || 0), 0),
        people: [...new Set(t.rows.map((r: any) => r.person).filter(Boolean))],
        places: [...new Set(t.rows.map((r: any) => r.vendor))].slice(0, 4),
      }))
      .sort((a, b) => b.total - a.total);
  };

  // Calendar years present in the data, newest first. Blank/garbage dates (the
  // 1905 epoch artefacts) are dropped rather than shown as a year.
  const years = [...new Set(receipts.map(yearOf))]
    .filter(y => /^(19[9]\d|20\d\d)$/.test(y))
    .sort((a, b) => b.localeCompare(a));

  // Category -> vendor -> receipts, computed client-side so drilling is instant.
  const breakdown = (() => {
    const scoped = receipts.filter(r => {
      // A cancelled/refunded/duplicate/void row, or one attributed to someone
      // outside the household, is just as "not counted" as one in a non-expense
      // category — this used to only check category, so a cancelled flight
      // (status set correctly on the row) still showed up under "Expenses" and
      // inflated every total on this tab. Mirrors isExpense() in lib/sheets.ts.
      const excluded = nonExpense.includes(r.category)
        || VOID_STATUSES_CLIENT.includes(r.status || '')
        || NON_HOUSEHOLD.includes(r.person || '');
      const inScope = breakdownScope === 'all' ? true : breakdownScope === 'excluded' ? excluded : !excluded;
      return inScope && (!breakdownYear || yearOf(r) === breakdownYear);
    });
    const total = scoped.reduce((s, r) => s + (r.usdEstimate || 0), 0);

    const cats = new Map<string, any>();
    for (const r of scoped) {
      const cat = r.category || '(uncategorised)';
      if (!cats.has(cat)) cats.set(cat, { name: cat, total: 0, count: 0, vendors: new Map() });
      const c = cats.get(cat);
      c.total += r.usdEstimate || 0;
      c.count += 1;

      const vendor = canonicalVendor(r.vendor);
      if (!c.vendors.has(vendor)) c.vendors.set(vendor, { name: vendor, total: 0, count: 0, rows: [] });
      const v = c.vendors.get(vendor);
      v.total += r.usdEstimate || 0;
      v.count += 1;
      v.rows.push(r);
    }

    return {
      total,
      categories: [...cats.values()]
        .map(c => ({
          ...c,
          vendors: [...c.vendors.values()]
            .map((v: any) => ({ ...v, rows: v.rows.sort((a: any, b: any) => (b.usdEstimate || 0) - (a.usdEstimate || 0)) }))
            .sort((a: any, b: any) => b.total - a.total),
        }))
        .sort((a, b) => b.total - a.total),
    };
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading receipts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Receipt Tracker</h1>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6">
          {/* Scrolls sideways on a phone — this app is now used one-handed to
              photograph a bill, so the tabs must not wrap into a stack. */}
          <div className="flex gap-8 overflow-x-auto whitespace-nowrap">
            <button
              onClick={() => setActiveTab('add')}
              className={`py-4 px-2 border-b-2 font-medium transition flex items-center gap-2 ${
                activeTab === 'add'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Camera size={18} />
              Add receipt
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-4 px-2 border-b-2 font-medium transition ${
                activeTab === 'dashboard'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('receipts')}
              className={`py-4 px-2 border-b-2 font-medium transition ${
                activeTab === 'receipts'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Receipts
            </button>
            <button
              onClick={() => setActiveTab('breakdown')}
              className={`py-4 px-2 border-b-2 font-medium transition ${
                activeTab === 'breakdown'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Breakdown
            </button>
            <button
              onClick={() => setActiveTab('travel')}
              className={`py-4 px-2 border-b-2 font-medium transition flex items-center gap-2 ${
                activeTab === 'travel'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Who travelled
              {unassignedTravel.length > 0 && (
                <span className="bg-teal-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {unassignedTravel.length}
                </span>
              )}
            </button>
            <button
              onClick={() => { setActiveTab('reconcile'); if (!reconcile) fetchReconcile(); }}
              className={`py-4 px-2 border-b-2 font-medium transition ${
                activeTab === 'reconcile'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Reconcile
            </button>
            <button
              onClick={() => { setActiveTab('duplicates'); if (!duplicates) fetchDuplicates(); }}
              className={`py-4 px-2 border-b-2 font-medium transition flex items-center gap-2 ${
                activeTab === 'duplicates'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Duplicates
              {duplicates?.totalGroups > 0 && (
                <span className="bg-rose-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {duplicates.groups.filter((g: any) => !dismissedGroups.has(g.key)).length}
                </span>
              )}
            </button>
            <button
              onClick={() => { setActiveTab('review'); if (!reviewQueue) fetchReviewQueue(); }}
              className={`py-4 px-2 border-b-2 font-medium transition flex items-center gap-2 ${
                activeTab === 'review'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Review
              {reviewQueue?.vendors?.length > 0 && (
                <span className="bg-orange-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {reviewQueue.vendors.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'add' && (
          <AddReceipt
            onSaved={fetchData}
            inUseCategories={Array.from(new Set(receipts.map((r: any) => r.category).filter(Boolean)))}
          />
        )}

        {activeTab === 'dashboard' && analytics && (
          <div className="space-y-8">
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-6">
                <p className="text-gray-600 text-sm font-medium">Total Spend (USD)</p>
                <p className="text-3xl font-bold text-gray-900">${analytics.totalSpend.toLocaleString()}</p>
                {analytics.excluded?.count > 0 && (
                  <button
                    onClick={() => setShowExcluded(v => !v)}
                    className="text-xs text-gray-500 mt-1 hover:text-indigo-600 text-left"
                  >
                    excludes {analytics.excluded.count} rows
                    (${Math.round(analytics.excluded.total).toLocaleString()})
                    <span className="ml-1 text-indigo-600">{showExcluded ? 'hide' : 'show'}</span>
                  </button>
                )}
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <p className="text-gray-600 text-sm font-medium">Transactions</p>
                <p className="text-3xl font-bold text-gray-900">{analytics.transactionCount}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <p className="text-gray-600 text-sm font-medium">Active Subscriptions</p>
                <p className="text-3xl font-bold text-gray-900">{analytics.subscriptionCount}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <p className="text-gray-600 text-sm font-medium">Avg Transaction</p>
                <p className="text-3xl font-bold text-gray-900">
                  ${analytics.transactionCount > 0 ? (analytics.totalSpend / analytics.transactionCount).toFixed(2) : '0'}
                </p>
              </div>
            </div>

            {/* What's held out of the total, and why. Kept out of the KPI grid —
                inline it swamped the Total Spend card. */}
            {showExcluded && analytics.excluded?.count > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-baseline justify-between gap-4 mb-1">
                  <h2 className="text-lg font-semibold text-gray-900">Not counted as spend</h2>
                  <button
                    onClick={() => setShowExcluded(false)}
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Hide
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  {analytics.excluded.count} rows, ${Math.round(analytics.excluded.total).toLocaleString()}.
                  Business and capital movements are held out by category; refunds, cancellations
                  and failed payments by status.
                </p>
                <div className="divide-y">
                  {analytics.excluded.byCategory.map((c: any) => (
                    <button
                      key={c.name}
                      onClick={() => drillIntoCategory(c.name)}
                      className="w-full py-2 text-left hover:bg-gray-50 group flex items-baseline justify-between gap-3"
                    >
                      <span className="font-medium text-gray-900 group-hover:text-indigo-600">{c.name}</span>
                      <span className="text-sm text-gray-500 whitespace-nowrap">{c.count} rows</span>
                      <span className="font-semibold text-gray-900 w-32 text-right whitespace-nowrap">
                        ${Math.round(c.total).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Year by year. The KPI above is a five-year lump, which hides the
                only thing anyone actually wants to know: whether this year is
                heavier than last. Counted rows only — same three exclusion axes
                as the total, so these columns add up to it. */}
            {(() => {
              const counted = receipts.filter(r =>
                !nonExpense.includes(r.category)
                && !VOID_STATUSES_CLIENT.includes(r.status || '')
                && !NON_HOUSEHOLD_CLIENT.includes(r.person || ''));

              const stats = years.map(y => {
                const rs = counted.filter(r => yearOf(r) === y);
                const total = rs.reduce((a, r) => a + (r.usdEstimate || 0), 0);
                const cats = new Map<string, number>();
                for (const r of rs) {
                  cats.set(r.category || 'Other', (cats.get(r.category || 'Other') || 0) + (r.usdEstimate || 0));
                }
                const top = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
                return { year: y, total, count: rs.length, top };
              }).filter(s => s.count > 0);

              if (!stats.length) return null;
              const peak = Math.max(...stats.map(s => s.total));
              const grand = stats.reduce((a, s) => a + s.total, 0);
              // Oldest year first for the run-rate note; `years` is newest-first.
              const chron = [...stats].reverse();
              const complete = chron.filter(s => s.year !== String(new Date().getFullYear()));
              const avg = complete.length
                ? complete.reduce((a, s) => a + s.total, 0) / complete.length : 0;
              const thisYear = stats.find(s => s.year === String(new Date().getFullYear()));

              return (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-baseline justify-between gap-4 mb-1">
                    <h2 className="text-lg font-semibold text-gray-900">Year by year</h2>
                    <span className="text-sm text-gray-500">
                      ${Math.round(grand).toLocaleString()} across {stats.length} years
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-5">
                    {avg > 0 && (
                      <>Averaging <strong className="text-gray-700">${Math.round(avg).toLocaleString()}</strong> a
                      year over {complete.length} complete {complete.length === 1 ? 'year' : 'years'}
                      {thisYear && (
                        <> — {new Date().getFullYear()} is at ${Math.round(thisYear.total).toLocaleString()},
                        {' '}{thisYear.total >= avg ? 'above' : 'below'} that pace</>
                      )}.</>
                    )}
                  </p>

                  <div className="space-y-3">
                    {stats.map(s => {
                      // Change against the previous calendar year, where there is one.
                      const idx = chron.findIndex(c => c.year === s.year);
                      const prev = idx > 0 ? chron[idx - 1] : null;
                      const delta = prev && prev.total > 0
                        ? ((s.total - prev.total) / prev.total) * 100 : null;
                      const isOpen = openYear === s.year;
                      return (
                        <div key={s.year}>
                          <button
                            onClick={() => setOpenYear(isOpen ? null : s.year)}
                            className="w-full text-left group"
                            aria-expanded={isOpen}
                          >
                            <div className="flex items-baseline justify-between gap-3 mb-1">
                              <span className="font-medium text-gray-900 w-14 group-hover:text-indigo-600">
                                <span className="inline-block w-3 text-gray-400">{isOpen ? '▾' : '▸'}</span>
                                {s.year}
                              </span>
                              <span className="text-xs text-gray-500 flex-1 truncate">
                                {s.count} rows{s.top ? ` · mostly ${s.top[0]}` : ''}
                              </span>
                              {/* Direction is spelled out, never carried by colour alone. */}
                              {delta !== null && (
                                <span className={`text-xs whitespace-nowrap ${delta >= 0 ? 'text-rose-700' : 'text-teal-700'}`}>
                                  {delta >= 0 ? '▲ up' : '▼ down'} {Math.abs(delta).toFixed(0)}%
                                </span>
                              )}
                              <span className="font-semibold text-gray-900 w-28 text-right tabular-nums">
                                ${Math.round(s.total).toLocaleString()}
                              </span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded overflow-hidden">
                              <div
                                className={`h-full rounded ${isOpen ? 'bg-indigo-600' : 'bg-indigo-500 group-hover:bg-indigo-600'}`}
                                style={{ width: `${peak > 0 ? (s.total / peak) * 100 : 0}%` }}
                              />
                            </div>
                          </button>
                          {isOpen && <YearDetail
                            year={s.year}
                            rows={counted.filter(r => yearOf(r) === s.year)}
                            total={s.total}
                            canonicalVendor={canonicalVendor}
                            onVendor={drillIntoVendor}
                          />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Every vendor billed more than once, summed per calendar year.
                Vendor spellings are merged first (see VENDOR_ALIASES) or a
                vendor's total splits across the names Claude gave it. */}
            {(() => {
              const expenses = receipts.filter(r => !nonExpense.includes(r.category));
              const map = new Map<string, any>();
              for (const r of expenses) {
                const v = canonicalVendor(r.vendor);
                const y = yearOf(r);
                if (!years.includes(y)) continue;
                if (!map.has(v)) map.set(v, { name: v, count: 0, total: 0, byYear: {} as any, spellings: new Set<string>() });
                const e = map.get(v);
                e.count += 1;
                e.total += r.usdEstimate || 0;
                e.byYear[y] = (e.byYear[y] || 0) + (r.usdEstimate || 0);
                e.spellings.add(r.vendor);
              }
              const vendors = [...map.values()].filter(v => v.count > 1);
              const shown = years.filter(y => vendors.some(v => v.byYear[y]));

              // Roll vendors up into parent companies, keeping the brands as children.
              const rows: any[] = [];
              const families = new Map<string, any>();
              for (const v of vendors) {
                const fam = vendorGroupOf(v.name);
                if (!fam) { rows.push({ ...v, kind: 'solo' }); continue; }
                if (!families.has(fam)) families.set(fam, { name: fam, count: 0, total: 0, byYear: {} as any, children: [] });
                const f = families.get(fam);
                f.count += v.count;
                f.total += v.total;
                for (const y of Object.keys(v.byYear)) f.byYear[y] = (f.byYear[y] || 0) + v.byYear[y];
                f.children.push(v);
              }
              for (const f of families.values()) {
                f.children.sort((a: any, b: any) => b.total - a.total);
                rows.push({ ...f, kind: f.children.length > 1 ? 'family' : 'solo', ...(f.children.length === 1 ? f.children[0] : {}) });
              }
              rows.sort((a, b) => b.total - a.total);

              const cells = (v: any, bold: boolean) => shown.map(y => (
                <td key={y} className={`py-2 text-right tabular-nums ${v.byYear[y] ? (bold ? 'text-gray-900' : 'text-gray-600') : 'text-gray-300'}`}>
                  {v.byYear[y] ? `$${Math.round(v.byYear[y]).toLocaleString()}` : '—'}
                </td>
              ));

              return (
                <div className="bg-white rounded-lg shadow p-6 overflow-x-auto">
                  <h2 className="text-lg font-semibold text-gray-900">Vendors billed more than once</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    {vendors.length} vendors, summed per calendar year. Parent companies show a family
                    total — click the arrow to see the individual brands.
                  </p>
                  <table className="w-full text-sm min-w-[760px]">
                    <thead>
                      <tr className="text-gray-500 border-b">
                        <th className="text-left pb-2 font-medium">Vendor</th>
                        <th className="text-right pb-2 font-medium w-16">Items</th>
                        {shown.map(y => <th key={y} className="text-right pb-2 font-medium w-24">{y}</th>)}
                        <th className="text-right pb-2 font-medium w-28">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(v => {
                        const open = openVendors.has('fam:' + v.name);
                        return (
                          <Fragment key={v.name}>
                            <tr className="border-b hover:bg-gray-50">
                              <td className="py-2">
                                {v.kind === 'family' ? (
                                  <button
                                    onClick={() => toggle(openVendors, 'fam:' + v.name, setOpenVendors)}
                                    className="text-gray-900 hover:text-indigo-600 font-semibold text-left"
                                  >
                                    <span className="inline-block w-4 text-gray-400">{open ? '▾' : '▸'}</span>
                                    {v.name}
                                    <span className="ml-1.5 text-[10px] text-gray-400">({v.children.length} brands)</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => drillIntoVendor([...(v.spellings || [v.name])][0])}
                                    className="text-gray-900 hover:text-indigo-600 font-medium text-left pl-4"
                                    title={v.spellings?.size > 1 ? `Merged: ${[...v.spellings].join(' · ')}` : undefined}
                                  >
                                    {v.name}
                                    {v.spellings?.size > 1 && (
                                      <span className="ml-1.5 text-[10px] text-gray-400">({v.spellings.size} names)</span>
                                    )}
                                  </button>
                                )}
                              </td>
                              <td className="py-2 text-right text-gray-500 tabular-nums">{v.count}</td>
                              {cells(v, true)}
                              <td className="py-2 text-right font-semibold text-gray-900 tabular-nums">
                                ${Math.round(v.total).toLocaleString()}
                              </td>
                            </tr>
                            {v.kind === 'family' && open && v.children.map((c: any) => (
                              <tr key={v.name + '|' + c.name} className="border-b bg-gray-50">
                                <td className="py-1.5 pl-10">
                                  <button
                                    onClick={() => drillIntoVendor([...c.spellings][0])}
                                    className="text-gray-700 hover:text-indigo-600 text-left"
                                    title={c.spellings.size > 1 ? `Merged: ${[...c.spellings].join(' · ')}` : undefined}
                                  >
                                    {c.name}
                                  </button>
                                </td>
                                <td className="py-1.5 text-right text-gray-500 tabular-nums">{c.count}</td>
                                {cells(c, false)}
                                <td className="py-1.5 text-right text-gray-700 tabular-nums">
                                  ${Math.round(c.total).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Calendar-year totals, and each category year by year */}
            {(() => {
              const expenses = receipts.filter(r => !nonExpense.includes(r.category));
              const perYear = years.map(y => {
                const rows = expenses.filter(r => yearOf(r) === y);
                return { year: y, total: rows.reduce((s, r) => s + (r.usdEstimate || 0), 0), count: rows.length };
              }).filter(y => y.count > 0);
              const maxYear = Math.max(1, ...perYear.map(y => y.total));

              // category -> year -> total, for the matrix below
              const catYear = new Map<string, Map<string, number>>();
              for (const r of expenses) {
                const c = r.category || '(uncategorised)';
                const y = yearOf(r);
                if (!years.includes(y)) continue;
                if (!catYear.has(c)) catYear.set(c, new Map());
                const m = catYear.get(c)!;
                m.set(y, (m.get(y) || 0) + (r.usdEstimate || 0));
              }
              const catRows = [...catYear.entries()]
                .map(([name, m]) => ({ name, byYear: m, total: [...m.values()].reduce((a, b) => a + b, 0) }))
                .sort((a, b) => b.total - a.total);
              const shownYears = perYear.map(y => y.year);

              return (
                <>
                  <div className="bg-white rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold text-gray-900">Spend by calendar year</h2>
                    <p className="text-sm text-gray-500 mb-4">Click a year to see that year&apos;s receipts</p>
                    <div className="divide-y">
                      {perYear.map(y => (
                        <button
                          key={y.year}
                          onClick={() => drillIntoYear(y.year)}
                          className="w-full py-2 text-left hover:bg-gray-50 group"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-semibold text-gray-900 group-hover:text-indigo-600 w-16">{y.year}</span>
                            <span className="text-sm text-gray-500 whitespace-nowrap">{y.count} receipts</span>
                            <span className="font-bold text-gray-900 w-32 text-right whitespace-nowrap">
                              ${Math.round(y.total).toLocaleString()}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded mt-1 overflow-hidden">
                            <div className="h-full bg-indigo-600 rounded" style={{ width: `${(y.total / maxYear) * 100}%` }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow p-6 overflow-x-auto">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Category by year</h2>
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="text-gray-500 border-b">
                          <th className="text-left pb-2 font-medium">Category</th>
                          {shownYears.map(y => (
                            <th key={y} className="text-right pb-2 font-medium w-24">{y}</th>
                          ))}
                          <th className="text-right pb-2 font-medium w-28">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catRows.map(c => (
                          <tr key={c.name} className="border-b last:border-b-0 hover:bg-gray-50">
                            <td className="py-2">
                              <button
                                onClick={() => drillIntoCategory(c.name)}
                                className="text-gray-900 hover:text-indigo-600 font-medium"
                              >
                                {c.name}
                              </button>
                            </td>
                            {shownYears.map(y => {
                              const v = c.byYear.get(y) || 0;
                              return (
                                <td key={y} className={`py-2 text-right ${v ? 'text-gray-900' : 'text-gray-300'}`}>
                                  {v ? `$${Math.round(v).toLocaleString()}` : '—'}
                                </td>
                              );
                            })}
                            <td className="py-2 text-right font-semibold text-gray-900">
                              ${Math.round(c.total).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-300 font-bold">
                          <td className="py-2 text-gray-900">Total</td>
                          {shownYears.map(y => {
                            const v = perYear.find(p => p.year === y)?.total || 0;
                            return <td key={y} className="py-2 text-right text-gray-900">${Math.round(v).toLocaleString()}</td>;
                          })}
                          <td className="py-2 text-right text-gray-900">
                            ${Math.round(perYear.reduce((s, y) => s + y.total, 0)).toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}

            {/* Where the money went — click any row to see the receipts behind it */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900">Where the money went</h2>
                <p className="text-sm text-gray-500 mb-4">Click a category to see its receipts</p>
                <div className="divide-y">
                  {[...analytics.byCategory].sort((a: any, b: any) => b.value - a.value).map((c: any) => {
                    const pct = analytics.totalSpend > 0 ? (c.value / analytics.totalSpend) * 100 : 0;
                    return (
                      <button
                        key={c.name}
                        onClick={() => drillIntoCategory(c.name)}
                        className="w-full py-2 text-left hover:bg-gray-50 group"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-medium text-gray-900 group-hover:text-indigo-600 truncate">
                            {c.name || '(uncategorised)'}
                          </span>
                          <span className="text-sm text-gray-500 whitespace-nowrap">
                            {c.count} · {pct.toFixed(1)}%
                          </span>
                          <span className="font-semibold text-gray-900 whitespace-nowrap w-28 text-right">
                            ${Math.round(c.value).toLocaleString()}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded mt-1 overflow-hidden">
                          <div className="h-full bg-indigo-600 rounded" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900">Biggest vendors</h2>
                <p className="text-sm text-gray-500 mb-4">Click a vendor to see its receipts</p>
                <div className="divide-y max-h-[520px] overflow-y-auto">
                  {analytics.byVendor?.map((v: any) => (
                    <button
                      key={v.name}
                      onClick={() => drillIntoVendor(v.name)}
                      className="w-full py-2 text-left hover:bg-gray-50 group flex items-baseline justify-between gap-3"
                    >
                      <span className="font-medium text-gray-900 group-hover:text-indigo-600 truncate">{v.name}</span>
                      <span className="text-sm text-gray-500 whitespace-nowrap">{v.count}</span>
                      <span className="font-semibold text-gray-900 whitespace-nowrap w-28 text-right">
                        ${Math.round(v.value).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Category Pie Chart */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Spend by Category</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analytics.byCategory}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label
                      onClick={(d: any) => d?.name && drillIntoCategory(d.name)}
                      className="cursor-pointer"
                    >
                      {analytics.byCategory.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => `$${typeof value === 'number' ? value.toFixed(2) : value}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Account Bar Chart */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Spend by Account</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.byAccount}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => `$${typeof value === 'number' ? value.toFixed(2) : value}`} />
                    <Bar dataKey="value" fill="#0088FE" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly Trend */}
              <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Spend Trend</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => `$${typeof value === 'number' ? value.toFixed(2) : value}`} />
                    <Line type="monotone" dataKey="value" stroke="#0088FE" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Active Subscriptions */}
            {analytics.subscriptions.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Subscriptions</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Vendor</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Category</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Renewal Date</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.subscriptions.map((sub: any, idx: number) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">{sub.vendor}</td>
                          <td className="py-3 px-4">{sub.category}</td>
                          <td className="py-3 px-4">{sub.renewalDate}</td>
                          <td className="py-3 px-4">{sub.currency} {sub.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'receipts' && (
          <div className="space-y-4">
            {/* Active filter banner — makes it obvious you arrived here from a
                dashboard click, and how to get back to everything. */}
            {(filterCategory || searchQuery || filterYear) && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="text-sm text-indigo-900">
                  Showing <strong>{filteredReceipts.length}</strong> of {receipts.length} receipts
                  {filterCategory && <> in <strong>{filterCategory}</strong></>}
                  {filterYear && <> from <strong>{filterYear}</strong></>}
                  {searchQuery && <> matching <strong>&ldquo;{searchQuery}&rdquo;</strong></>}
                  {' · '}
                  <strong>
                    ${Math.round(filteredReceipts.reduce((s, r) => s + (r.usdEstimate || 0), 0)).toLocaleString()}
                  </strong>
                </span>
                <button
                  onClick={() => { setFilterCategory(''); setSearchQuery(''); setFilterYear(''); }}
                  className="ml-auto text-sm text-indigo-700 hover:text-indigo-900 underline"
                >
                  Clear filter
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterYear('')}
                className={`px-3 py-1 text-sm rounded-full border transition ${
                  filterYear === ''
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-gray-300 text-gray-700 hover:border-indigo-600'
                }`}
              >
                All years
              </button>
              {years.map(y => (
                <button
                  key={y}
                  onClick={() => setFilterYear(y)}
                  className={`px-3 py-1 text-sm rounded-full border transition ${
                    filterYear === y
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-300 text-gray-700 hover:border-indigo-600'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>

            {/* Description Modal */}
            {descriptionModal !== null && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-900">Edit Description</h2>
                    <button
                      onClick={() => setDescriptionModal(null)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <textarea
                      value={descriptionModal.description}
                      onChange={(e) => setDescriptionModal({ ...descriptionModal, description: e.target.value })}
                      placeholder="Add notes about this receipt..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                      rows={4}
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => setDescriptionModal(null)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                      disabled={savingDescription}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveDescription}
                      disabled={savingDescription}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium disabled:bg-gray-400 hover:bg-indigo-700"
                    >
                      {savingDescription ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Rename Modal */}
            {renameModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-900">Rename Vendor</h2>
                    <button
                      onClick={() => setRenameModal(null)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Old Name
                      </label>
                      <input
                        type="text"
                        value={renameModal.oldName}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        New Name
                      </label>
                      <input
                        type="text"
                        value={renameModal.newName}
                        onChange={(e) => setRenameModal({ ...renameModal, newName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                        autoFocus
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      This will rename "{renameModal.oldName}" in all {receipts.filter(r => r.vendor === renameModal.oldName).length} receipt(s)
                    </p>
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => setRenameModal(null)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                      disabled={renaming}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRenameVendor}
                      disabled={renaming || !renameModal.newName.trim()}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium disabled:bg-gray-400 hover:bg-indigo-700"
                    >
                      {renaming ? 'Updating...' : 'Update All'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bulk Actions */}
            {selectedRows.size > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900">
                  {selectedRows.size} selected
                </span>
                <div className="flex gap-2">
                  <select
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select category...</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleBulkUpdateCategory}
                    disabled={!bulkCategory}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:bg-gray-400 hover:bg-blue-700 transition"
                  >
                    Update Category
                  </button>
                </div>

                {/* Money that never actually left: a refunded flight, a cancelled
                    booking, a failed payment. Kept as a record, not counted. */}
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-blue-200">
                  <span className="text-sm text-blue-900 font-medium">Didn&apos;t actually pay this:</span>
                  {['Refunded', 'Cancelled', 'Failed', 'Duplicate'].map(s => (
                    <button
                      key={s}
                      onClick={() => handleSetStatus(s)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-rose-300 text-rose-700 bg-white hover:bg-rose-600 hover:text-white hover:border-rose-600 transition"
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    onClick={() => handleSetStatus('')}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition ml-2"
                  >
                    Undo / count it again
                  </button>
                </div>
              </div>
            )}

            {/* Search and Filter */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search size={18} className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search vendor, date, category, subject..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
                />
              </div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Receipts Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="py-3 px-4 text-left font-medium text-gray-900">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRows(new Set(filteredReceipts.map((_, i) => i)));
                          } else {
                            setSelectedRows(new Set());
                          }
                        }}
                        checked={selectedRows.size === filteredReceipts.length && filteredReceipts.length > 0}
                      />
                    </th>
                    <th className="py-3 px-4 text-left font-medium text-gray-900">Date</th>
                    <th className="py-3 px-4 text-left font-medium text-gray-900">Vendor</th>
                    <th className="py-3 px-4 text-left font-medium text-gray-900">Amount</th>
                    <th className="py-3 px-4 text-left font-medium text-gray-900">Category</th>
                    <th className="py-3 px-4 text-left font-medium text-gray-900">Description</th>
                    <th className="py-3 px-4 text-left font-medium text-gray-900">Subscription</th>
                    <th className="py-3 px-4 text-left font-medium text-gray-900">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-500">
                        No receipts found
                      </td>
                    </tr>
                  ) : (
                    filteredReceipts.map((receipt, idx) => (
                      <tr
                        key={idx}
                        className={`border-b hover:bg-gray-50 ${
                          receipt.status ? 'text-gray-400 line-through decoration-rose-400' : ''
                        }`}
                        title={receipt.status ? `${receipt.status} — not counted as spend` : undefined}
                      >
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(idx)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedRows);
                              if (e.target.checked) {
                                newSelected.add(idx);
                              } else {
                                newSelected.delete(idx);
                              }
                              setSelectedRows(newSelected);
                            }}
                          />
                        </td>
                        <td className="py-3 px-4">{receipt.date}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium" title={receipt.subject || undefined}>{receipt.vendor}</span>
                            {receipt.status && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 no-underline">
                                {receipt.status}
                              </span>
                            )}
                            <button
                              onClick={() => setRenameModal({ oldName: receipt.vendor, newName: receipt.vendor })}
                              className="text-gray-400 hover:text-indigo-600 transition"
                              title="Rename vendor"
                            >
                              <Edit2 size={16} />
                            </button>
                          </div>
                          {receipt.subject && (
                            <div className="text-xs text-gray-400 truncate max-w-[220px]">{receipt.subject}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">{receipt.currency} {receipt.amount.toFixed(2)}</td>
                        <td className="py-3 px-4">{receipt.category}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600 truncate max-w-xs">
                              {receipt.description || <span className="text-gray-400">Add notes...</span>}
                            </span>
                            <button
                              onClick={() => setDescriptionModal({ rowIndex: idx, description: receipt.description })}
                              className="text-gray-400 hover:text-indigo-600 transition flex-shrink-0"
                              title="Edit description"
                            >
                              <Edit2 size={16} />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4">{receipt.isSubscription === 'Yes' ? '✓' : '-'}</td>
                        <td className="py-3 px-4">
                          {gmailSourceLink(receipt) ? (
                            <a
                              href={gmailSourceLink(receipt)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-indigo-600 transition inline-flex"
                              title="Open the original email in Gmail — PNR, passengers, price breakdown, attached receipt"
                            >
                              <Mail size={16} />
                            </a>
                          ) : (
                            <span className="text-gray-300" title="No linked email for this row">
                              <Mail size={16} />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'reconcile' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900">Reconcile against your card statement</h2>
              <p className="text-gray-600 mt-1">
                The tracker only knows what vendors emailed you. Your statement knows what was
                actually charged. Upload the CSV and this shows both gaps.
              </p>
              <ol className="text-sm text-gray-600 mt-3 space-y-1 list-decimal list-inside">
                <li>On amex.com go to <strong>Statements &amp; Activity → Download → CSV</strong></li>
                <li>Pick the date range you want (they allow several years back)</li>
                <li>Drop the file below — nothing is sent anywhere but this app</li>
              </ol>

              <label className="mt-4 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleStatementUpload(f); }}
                />
                <span className="text-gray-600">
                  {reconcileBusy ? 'Working…' : 'Choose a statement CSV, or drop one here'}
                </span>
              </label>

              {reconcileError && (
                <p className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                  {reconcileError}
                </p>
              )}

              {reconcile?.totals && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1 mt-5 bg-gray-200 border border-gray-200 rounded overflow-hidden">
                  {[
                    ['Charges on statement', reconcile.totals.charges, reconcile.totals.chargeValue, ''],
                    ['Matched to a receipt', reconcile.totals.matched, reconcile.totals.matchedValue, 'text-teal-700',
                      `${reconcile.totals.matchedExact} exact · ${reconcile.totals.matchedFx} via FX tolerance`],
                    ['Charged, no receipt', reconcile.totals.chargesNoReceipt, reconcile.totals.chargesNoReceiptValue, 'text-rose-700'],
                    ['Receipt, no charge', reconcile.totals.receiptsNoCharge, reconcile.totals.receiptsNoChargeValue, 'text-amber-700'],
                  ].map(([label, n, v, cls, note]: any) => (
                    <div key={label} className="bg-white p-3">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">{label}</div>
                      <div className={`text-xl font-bold tabular-nums ${cls}`}>${Math.round(v).toLocaleString()}</div>
                      <div className="text-xs text-gray-500">{n} rows</div>
                      {note && <div className="text-[11px] text-gray-400 mt-0.5">{note}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {reconcile?.totals && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-4">
                  {([
                    ['chargesNoReceipt', `Charged but no receipt (${reconcile.totals.chargesNoReceipt})`],
                    ['receiptsNoCharge', `Receipt but no charge (${reconcile.totals.receiptsNoCharge})`],
                  ] as const).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setReconcileSide(k)}
                      className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${
                        reconcileSide === k ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <p className="text-sm text-gray-500 mb-3">
                  {reconcileSide === 'chargesNoReceipt'
                    ? `Real money left your card and no receipt email was found — spending the tracker is missing entirely. Foreign-currency charges are matched within ${Math.round((reconcile.fxTolerance || 0.06) * 100)}%, since Amex and the tracker convert at different rates.`
                    : 'A receipt exists but no matching charge on this card — paid another way, on a different card, or never actually billed.'}
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="pb-2 font-medium w-28">Date</th>
                        <th className="pb-2 font-medium">{reconcileSide === 'chargesNoReceipt' ? 'Statement description' : 'Vendor / subject'}</th>
                        <th className="pb-2 font-medium text-right w-28">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reconcile[reconcileSide] || []).map((x: any, i: number) => (
                        <tr key={i} className="border-b last:border-b-0">
                          <td className="py-2 text-gray-600 tabular-nums">{x.date}</td>
                          <td className="py-2 text-gray-900">
                            {reconcileSide === 'chargesNoReceipt'
                              ? x.description
                              : <><span className="font-medium">{x.vendor}</span> <span className="text-gray-500">— {x.description || x.subject}</span></>}
                          </td>
                          <td className="py-2 text-right font-semibold tabular-nums">
                            ${Math.round(Math.abs(x.amount ?? x.usdEstimate ?? 0)).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'travel' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Who was this trip for?</h2>
                  <p className="text-gray-600 mt-1">
                    Flights and hotels are often booked under your name for someone else. The route
                    and dates are shown so you can judge each one.
                  </p>
                  <div className="relative mt-3 max-w-xs">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search vendor, route, person, date..."
                      value={travelSearch}
                      onChange={(e) => setTravelSearch(e.target.value)}
                      className="pl-9 pr-3 py-2 w-full border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    {([['trips', 'By trip'], ['items', 'One by one']] as const).map(([k, label]) => (
                      <button
                        key={k}
                        onClick={() => setTravelView(k)}
                        className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${
                          travelView === k ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    {([['unassigned', 'Not yet assigned'], ['all', 'All travel']] as const).map(([k, label]) => (
                      <button
                        key={k}
                        onClick={() => setTravelFilter(k)}
                        className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${
                          travelFilter === k ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Totals per person, so the split is visible as you go */}
              <div className="flex flex-wrap gap-2 mt-4">
                {PEOPLE.map(p => {
                  const rows = travelRows.filter(r => r.person === p);
                  if (!rows.length) return null;
                  const total = rows.reduce((s, r) => s + (r.usdEstimate || 0), 0);
                  return (
                    <span key={p} className="text-sm bg-gray-100 text-gray-800 px-3 py-1 rounded-full">
                      {p}: <strong>${Math.round(total).toLocaleString()}</strong>
                      <span className="text-gray-500"> ({rows.length})</span>
                    </span>
                  );
                })}
                <span className="text-sm bg-teal-50 text-teal-800 px-3 py-1 rounded-full">
                  Unassigned: <strong>
                    ${Math.round(unassignedTravel.reduce((s, r) => s + (r.usdEstimate || 0), 0)).toLocaleString()}
                  </strong>
                  <span className="text-teal-600"> ({unassignedTravel.length})</span>
                </span>
              </div>
            </div>

            {travelView === 'trips' && tripsOf(travelFilter === 'unassigned' ? unassignedTravel : travelRows)
              .slice(0, 80)
              .map(trip => {
                const open = openTrips.has(trip.key);
                const idxs = trip.rows.map((r: any) => r.idx);
                const busy = savingPerson === idxs.join(',');
                const span = trip.start === trip.end ? trip.start : `${trip.start} → ${trip.end}`;
                return (
                  <div key={trip.key} className="bg-white rounded-lg shadow p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{span}</span>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {trip.rows.length} bookings
                          </span>
                          {trip.people.map((p: string) => (
                            <span key={p} className={`text-xs font-semibold px-2 py-0.5 rounded ${
                              NON_HOUSEHOLD.includes(p) ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'
                            }`}>{p}</span>
                          ))}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{trip.places.join(' · ')}</p>
                        {/* One representative description tells you what the trip was */}
                        <p className="text-sm text-gray-800 mt-1">
                          {(trip.rows.find((r: any) => r.category === 'Airlines') || trip.rows[0]).description
                            || (trip.rows[0].subject || '')}
                        </p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="text-lg font-bold text-gray-900">
                          ${Math.round(trip.total).toLocaleString()}
                        </div>
                        <button
                          onClick={() => toggle(openTrips, trip.key, setOpenTrips)}
                          className="text-sm text-indigo-600 hover:text-indigo-800"
                        >
                          {open ? 'Hide' : 'Show'} {trip.rows.length} items
                        </button>
                      </div>
                    </div>

                    {open && (
                      <div className="mt-3 pl-3 border-l-2 border-gray-200 space-y-2">
                        {trip.rows.map((r: any) => (
                          <div key={r.idx} className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className="text-sm text-gray-500">{r.date}</span>{' '}
                              <span className="text-sm font-medium text-gray-900">{r.vendor}</span>
                              {r.person && (
                                <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                                  {r.person}
                                </span>
                              )}
                              <p className="text-xs text-gray-600">{(r.description || r.subject || '').slice(0, 110)}</p>
                            </div>
                            <div className="flex items-center gap-1 whitespace-nowrap">
                              <span className="text-sm text-gray-700 tabular-nums">
                                ${Math.round(r.usdEstimate || 0).toLocaleString()}
                              </span>
                              <button
                                onClick={() => handleSetPerson([r.idx], 'Me')}
                                className="text-[11px] px-2 py-0.5 rounded border border-teal-500 text-teal-700 hover:bg-teal-50"
                              >Mine</button>
                              <button
                                onClick={() => handleSetPerson([r.idx], 'Someone else')}
                                className="text-[11px] px-2 py-0.5 rounded border border-rose-400 text-rose-700 hover:bg-rose-50"
                              >Not</button>
                              <button
                                onClick={() => handleSetStatusRows([r.idx], 'Cancelled')}
                                className="text-[11px] px-2 py-0.5 rounded border border-amber-400 text-amber-700 hover:bg-amber-50"
                              >Cancel</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* One click assigns the whole trip */}
                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
                      <button
                        disabled={busy}
                        onClick={() => handleSetPerson(idxs, 'Me')}
                        className="px-4 py-2 text-sm font-semibold rounded-lg border-2 border-teal-600 text-teal-700 hover:bg-teal-600 hover:text-white transition disabled:opacity-40"
                      >
                        ✓ Whole trip is mine
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleSetPerson(idxs, 'Family')}
                        className="px-4 py-2 text-sm font-semibold rounded-lg border-2 border-indigo-500 text-indigo-700 hover:bg-indigo-600 hover:text-white transition disabled:opacity-40"
                      >
                        Family trip
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleSetPerson(idxs, 'Someone else')}
                        className="px-4 py-2 text-sm font-semibold rounded-lg border-2 border-rose-500 text-rose-700 hover:bg-rose-600 hover:text-white transition disabled:opacity-40"
                      >
                        ✗ Not mine
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleSetStatusRows(idxs, 'Cancelled')}
                        className="px-3 py-2 text-sm rounded-lg border border-amber-400 text-amber-700 hover:bg-amber-50 transition disabled:opacity-40"
                      >
                        ⊘ Trip cancelled
                      </button>
                      {busy && <span className="text-sm text-indigo-600">Saving…</span>}
                    </div>
                  </div>
                );
              })}

            {travelView === 'items' && (travelFilter === 'unassigned' ? unassignedTravel : travelRows)
              // Flights first: they name passengers, so assigning them fills in
              // the context that makes the ambiguous hotel bookings decidable.
              .slice()
              .sort((a, b) =>
                (a.category === 'Airlines' ? 0 : 1) - (b.category === 'Airlines' ? 0 : 1)
                || (b.usdEstimate || 0) - (a.usdEstimate || 0))
              .slice(0, 150)
              .map(r => (
                <div key={r.idx} className="bg-white rounded-lg shadow p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{r.vendor}</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{r.category}</span>
                        <span className="text-sm text-gray-500">{r.date}</span>
                        {r.person && (
                          <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded">
                            {r.person}
                          </span>
                        )}
                        {gmailSourceLink(r) && (
                          <a
                            href={gmailSourceLink(r)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-indigo-600 transition"
                            title="Open the original email in Gmail — passenger names, PNR, price breakdown"
                          >
                            <Mail size={14} />
                          </a>
                        )}
                      </div>
                      {/* Passenger names read straight from the source email, not the
                          AI-written description — that description can be wrong (see
                          the Qatar Airways case), so this is the field to trust first. */}
                      {r.passengers && (
                        <p className="text-sm mt-1">
                          <span className="text-xs font-semibold text-teal-800 uppercase tracking-wide">Passengers: </span>
                          <span className="text-gray-800">{r.passengers}</span>
                        </p>
                      )}
                      {/* The description carries route, dates and passengers — the
                          whole point of this screen, so it leads. */}
                      <p className="text-gray-800 mt-1.5">{r.description || r.subject}</p>
                      {r.description && (
                        <p className="text-xs text-gray-400 mt-1 truncate">{r.subject}</p>
                      )}

                      {/* Hotels are always booked as "A Singh" / "A S Mehta", so the
                          booking itself never says who stayed. The flights around
                          the same dates usually do — they name passengers. */}
                      {(r.category === 'Hotels' || r.category === 'Travel') && (() => {
                        const d = Date.parse(r.date);
                        if (!Number.isFinite(d)) return null;
                        const near = travelRows.filter(f =>
                          f.idx !== r.idx && f.category === 'Airlines' &&
                          Math.abs(Date.parse(f.date) - d) <= 10 * 86400000);
                        if (!near.length) return null;
                        return (
                          <div className="mt-2 pl-3 border-l-2 border-teal-200">
                            <p className="text-xs font-semibold text-teal-800 uppercase tracking-wide">
                              Flights within 10 days
                            </p>
                            {near.slice(0, 3).map(f => (
                              <p key={f.idx} className="text-xs text-gray-600 mt-0.5">
                                <span className="text-gray-400">{f.date}</span>{' '}
                                {f.person && (
                                  <span className="text-indigo-700 font-semibold">[{f.person}]</span>
                                )}{' '}
                                {(f.description || f.subject).slice(0, 96)}
                              </p>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="text-lg font-bold text-gray-900">
                        ${Math.round(r.usdEstimate || 0).toLocaleString()}
                      </div>
                      {r.currency !== 'USD' && (
                        <div className="text-xs text-gray-500">{r.currency} {r.amount?.toLocaleString()}</div>
                      )}
                    </div>
                  </div>

                  {/* The quick call first — most bookings only need "was this mine
                      or not". The specific person is there when it matters. */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
                    <button
                      disabled={savingPerson === String(r.idx)}
                      onClick={() => handleSetPerson([r.idx], 'Me')}
                      className={`px-4 py-2 text-sm font-semibold rounded-lg border-2 transition disabled:opacity-40 ${
                        r.person === 'Me'
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'border-teal-600 text-teal-700 hover:bg-teal-50'
                      }`}
                    >
                      ✓ Mine
                    </button>
                    <button
                      disabled={savingPerson === String(r.idx)}
                      onClick={() => handleSetPerson([r.idx], 'Someone else')}
                      className={`px-4 py-2 text-sm font-semibold rounded-lg border-2 transition disabled:opacity-40 ${
                        NON_HOUSEHOLD.includes(r.person || '')
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'border-rose-500 text-rose-700 hover:bg-rose-50'
                      }`}
                    >
                      ✗ Not mine — don&apos;t count it
                    </button>
                    {/* A separate question from who: the trip may never have
                        happened at all. Voids the row and drops it from this list. */}
                    <button
                      disabled={savingPerson === String(r.idx)}
                      onClick={() => handleSetStatusRows([r.idx], 'Cancelled')}
                      className="px-4 py-2 text-sm font-semibold rounded-lg border-2 border-amber-500 text-amber-700 hover:bg-amber-600 hover:text-white hover:border-amber-600 transition disabled:opacity-40"
                    >
                      ⊘ Cancelled — remove
                    </button>
                    <button
                      disabled={savingPerson === String(r.idx)}
                      onClick={() => handleSetStatusRows([r.idx], 'Refunded')}
                      className="px-3 py-2 text-sm rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition disabled:opacity-40"
                    >
                      Refunded
                    </button>
                    {r.person && (
                      <button
                        onClick={() => handleSetPerson([r.idx], '')}
                        className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-xs text-gray-400 mr-1">or say exactly who:</span>
                    {PEOPLE.filter(p => p !== 'Me').map(p => (
                      <button
                        key={p}
                        disabled={savingPerson === String(r.idx)}
                        onClick={() => handleSetPerson([r.idx], p)}
                        className={`px-2.5 py-1 text-xs rounded-full border transition disabled:opacity-40 ${
                          r.person === p
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : NON_HOUSEHOLD.includes(p)
                              ? 'border-rose-200 text-rose-700 hover:border-rose-500'
                              : 'border-gray-300 text-gray-700 hover:border-indigo-600'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

            {(travelFilter === 'unassigned' ? unassignedTravel : travelRows).length === 0 && (
              <div className="bg-white rounded-lg shadow p-10 text-center">
                <p className="text-2xl font-semibold text-gray-900">All travel assigned</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'duplicates' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900">Suspected duplicates</h2>
              <p className="text-gray-600 mt-1">
                Same amount, same vendor or same subject. Nothing is deleted until you say so —
                <strong> Merge</strong> keeps the top row and removes the rest.
              </p>
              {duplicates && (
                <p className="text-sm text-gray-500 mt-3">
                  {duplicates.groups.filter((g: any) => !dismissedGroups.has(g.key)).length} groups
                  {' · '}${Math.round(duplicates.totalWasted).toLocaleString()} of double-counting if all are real
                </p>
              )}
            </div>

            {dupLoading && (
              <div className="bg-white rounded-lg shadow p-10 text-center text-gray-500">Loading…</div>
            )}

            {duplicates && !dupLoading &&
              duplicates.groups.filter((g: any) => !dismissedGroups.has(g.key)).length === 0 && (
              <div className="bg-white rounded-lg shadow p-10 text-center">
                <p className="text-2xl font-semibold text-gray-900">Nothing left to review</p>
              </div>
            )}

            {duplicates?.groups.filter((g: any) => !dismissedGroups.has(g.key)).map((g: any) => (
              <div key={g.key} className="bg-white rounded-lg shadow p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                  <div>
                    <span className="text-lg font-semibold text-gray-900">
                      {g.currency} {g.amount?.toLocaleString()}
                    </span>
                    <span className="text-gray-500"> × {g.rows.length} rows</span>
                    <p className="text-sm text-gray-500">
                      ${Math.round(g.wastedUsd).toLocaleString()} counted more than once if these are the same
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDismissedGroups(prev => new Set(prev).add(g.key))}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Keep both
                    </button>
                    <button
                      onClick={() => handleMergeGroup(g)}
                      disabled={mergingKey === g.key}
                      className="px-3 py-1.5 text-sm bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 disabled:bg-gray-400"
                    >
                      {mergingKey === g.key ? 'Merging…' : `Merge (keep 1, delete ${g.rows.length - 1})`}
                    </button>
                  </div>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 font-medium w-8"></th>
                      <th className="pb-2 font-medium w-28">Date</th>
                      <th className="pb-2 font-medium">Vendor</th>
                      <th className="pb-2 font-medium">Subject</th>
                      <th className="pb-2 font-medium w-36">Category</th>
                      <th className="pb-2 font-medium w-32">Mailbox</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r: any, i: number) => (
                      <tr key={i} className={`border-b last:border-b-0 ${i === 0 ? 'bg-green-50' : ''}`}>
                        <td className="py-2 text-xs font-medium text-gray-500">
                          {i === 0 ? 'KEEP' : 'del'}
                        </td>
                        <td className="py-2 text-gray-600">{r.date}</td>
                        <td className="py-2 text-gray-900">{r.vendor}</td>
                        <td className="py-2 text-gray-600">{r.subject}</td>
                        <td className="py-2 text-gray-600">{r.category}</td>
                        <td className="py-2 text-gray-500">{r.emailAccount?.split('@')[0]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'breakdown' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Breakdown</h2>
                  <p className="text-gray-600 text-sm mt-1">
                    Click a category to see its vendors, then a vendor to see every receipt.
                  </p>
                </div>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  {([
                    ['expenses', 'Expenses'],
                    ['excluded', 'Excluded'],
                    ['all', 'Everything'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setBreakdownScope(key)}
                      className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${
                        breakdownScope === key ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  onClick={() => setBreakdownYear('')}
                  className={`px-3 py-1 text-sm rounded-full border transition ${
                    breakdownYear === ''
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-300 text-gray-700 hover:border-indigo-600'
                  }`}
                >
                  All years
                </button>
                {years.map(y => (
                  <button
                    key={y}
                    onClick={() => setBreakdownYear(y)}
                    className={`px-3 py-1 text-sm rounded-full border transition ${
                      breakdownYear === y
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-gray-300 text-gray-700 hover:border-indigo-600'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
              <p className="text-3xl font-bold text-gray-900 mt-4">
                ${Math.round(breakdown.total).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">
                {breakdown.categories.reduce((s, c) => s + c.count, 0)} receipts across{' '}
                {breakdown.categories.length} categories
              </p>
            </div>

            {breakdown.categories.map((cat: any) => {
              const catPct = breakdown.total > 0 ? (cat.total / breakdown.total) * 100 : 0;
              const catOpen = openCats.has(cat.name);
              return (
                <div key={cat.name} className="bg-white rounded-lg shadow overflow-hidden">
                  <button
                    onClick={() => toggle(openCats, cat.name, setOpenCats)}
                    className="w-full px-6 py-4 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-gray-900">
                        <span className="inline-block w-4 text-gray-400">{catOpen ? '▾' : '▸'}</span>
                        {cat.name}
                      </span>
                      <span className="text-sm text-gray-500 whitespace-nowrap">
                        {cat.count} receipts · {cat.vendors.length} vendors · {catPct.toFixed(1)}%
                      </span>
                      <span className="font-bold text-gray-900 w-32 text-right whitespace-nowrap">
                        ${Math.round(cat.total).toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded mt-2 overflow-hidden">
                      <div className="h-full bg-indigo-600 rounded" style={{ width: `${Math.min(100, catPct)}%` }} />
                    </div>
                  </button>

                  {catOpen && (
                    <div className="border-t bg-gray-50 px-6 py-2">
                      {cat.vendors.map((v: any) => {
                        const vKey = `${cat.name}|${v.name}`;
                        const vOpen = openVendors.has(vKey);
                        const vPct = cat.total > 0 ? (v.total / cat.total) * 100 : 0;
                        return (
                          <div key={vKey} className="border-b last:border-b-0 border-gray-200">
                            <button
                              onClick={() => toggle(openVendors, vKey, setOpenVendors)}
                              className="w-full py-2 text-left hover:bg-gray-100 flex items-baseline justify-between gap-3"
                            >
                              <span className="text-gray-900 truncate">
                                <span className="inline-block w-4 text-gray-400">{vOpen ? '▾' : '▸'}</span>
                                {v.name}
                              </span>
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                {v.count} · {vPct.toFixed(0)}% of {cat.name}
                              </span>
                              <span className="font-semibold text-gray-900 w-28 text-right whitespace-nowrap">
                                ${Math.round(v.total).toLocaleString()}
                              </span>
                            </button>

                            {vOpen && (
                              <div className="pb-2 pl-6">
                                <table className="w-full text-sm">
                                  <tbody>
                                    {v.rows.map((r: any, i: number) => (
                                      <tr key={i} className="border-t border-gray-100 align-top">
                                        <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap w-24">{r.date}</td>
                                        <td className="py-1.5 pr-3 text-gray-700">
                                          {/* The subject alone is often generic ("Your Electronic
                                              Receipt") — the description says what it actually was. */}
                                          <div>{r.description || r.subject}</div>
                                          {r.description && r.description !== r.subject && (
                                            <div className="text-xs text-gray-400">{r.subject}</div>
                                          )}
                                          {r.status && (
                                            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                              {r.status}
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap w-32">
                                          {r.emailAccount?.split('@')[0]}
                                        </td>
                                        <td className="py-1.5 text-right text-gray-900 whitespace-nowrap w-28">
                                          {r.currency} {r.amount?.toLocaleString()}
                                          {r.currency !== 'USD' && (
                                            <span className="text-gray-400"> (${Math.round(r.usdEstimate).toLocaleString()})</span>
                                          )}
                                        </td>
                                        <td className="py-1.5 pl-2 text-right w-8">
                                          {gmailSourceLink(r) ? (
                                            <a
                                              href={gmailSourceLink(r)!}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-gray-400 hover:text-indigo-600 transition inline-flex"
                                              title="Open the original email in Gmail"
                                            >
                                              <Mail size={14} />
                                            </a>
                                          ) : (
                                            <span className="text-gray-300" title="No linked email for this row">
                                              <Mail size={14} />
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'review' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900">Classify unsorted receipts</h2>
              <p className="text-gray-600 mt-1">
                Grouped by vendor, biggest spend first. Choosing a category applies it to every
                unsorted row for that vendor and teaches the scraper, so it won&apos;t ask again.
              </p>
              {reviewQueue && (
                <p className="text-sm text-gray-500 mt-3">
                  {reviewQueue.vendors.length} vendors left
                  {reviewQueue.vendors.length > 0 && (
                    <> · {reviewQueue.vendors.reduce((s: number, v: any) => s + v.count, 0)} rows
                    · ${Math.round(reviewQueue.vendors.reduce((s: number, v: any) => s + v.totalUsd, 0)).toLocaleString()}</>
                  )}
                </p>
              )}
            </div>

            {reviewLoading && (
              <div className="bg-white rounded-lg shadow p-10 text-center text-gray-500">Loading…</div>
            )}

            {reviewQueue && !reviewLoading && reviewQueue.vendors.length === 0 && (
              <div className="bg-white rounded-lg shadow p-10 text-center">
                <p className="text-2xl font-semibold text-gray-900">All done</p>
                <p className="text-gray-600 mt-2">Every receipt has a real category.</p>
              </div>
            )}

            {reviewQueue?.vendors.map((v: any) => (
              <div key={v.vendorKey} className="bg-white rounded-lg shadow p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">{v.vendor}</h3>
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                        currently &ldquo;{v.category || 'blank'}&rdquo;
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {v.count} {v.count === 1 ? 'row' : 'rows'}
                      {' · '}${Math.round(v.totalUsd).toLocaleString()}
                      {' · '}latest {v.latest || '—'}
                      {' · '}{v.accounts.map((a: string) => a.split('@')[0]).join(', ')}
                    </p>
                  </div>
                  <button
                    onClick={() => setExpandedVendor(expandedVendor === v.vendorKey ? null : v.vendorKey)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 whitespace-nowrap"
                  >
                    {expandedVendor === v.vendorKey ? 'Hide' : 'Show'} example subjects
                  </button>
                </div>

                {expandedVendor === v.vendorKey && (
                  <ul className="mt-3 space-y-1 border-l-2 border-gray-200 pl-4">
                    {v.samples.map((s: string, i: number) => (
                      <li key={i} className="text-sm text-gray-600 truncate">{s}</li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2 mt-4">
                  {reviewQueue.categories.map((cat: string) => (
                    <button
                      key={cat}
                      disabled={savingVendor === v.vendorKey}
                      onClick={() => handleClassifyVendor(v.vendorKey, cat)}
                      className="px-3 py-1.5 text-sm rounded-full border border-gray-300 text-gray-700
                                 hover:border-indigo-600 hover:bg-indigo-600 hover:text-white
                                 disabled:opacity-40 transition"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {savingVendor === v.vendorKey && (
                  <p className="text-sm text-indigo-600 mt-3">Saving…</p>
                )}
              </div>
            ))}

            {Object.keys(justSaved).length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold text-gray-900 mb-2">Classified this session</h3>
                <ul className="space-y-1">
                  {Object.entries(justSaved).map(([k, cat]) => (
                    <li key={k} className="text-sm text-gray-600">
                      <span className="text-gray-900">{k}</span> → {cat}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * What one year was actually made of, opened out under its bar.
 *
 * Three questions, in the order they get asked: where did it go (categories),
 * who took it (vendors, clickable through to the rows), and when did it happen
 * (months, which is what exposes a lumpy year like school fees or one big trip).
 */
function YearDetail({ year, rows, total, canonicalVendor, onVendor }: {
  year: string;
  rows: any[];
  total: number;
  canonicalVendor: (v: string) => string;
  onVendor: (v: string) => void;
}) {
  const sumBy = (key: (r: any) => string) => {
    const m = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      const k = key(r) || 'Other';
      const e = m.get(k) || { total: 0, count: 0 };
      e.total += r.usdEstimate || 0;
      e.count += 1;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  };

  const categories = sumBy(r => r.category);
  const vendors = sumBy(r => canonicalVendor(r.vendor)).slice(0, 8);

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthly = MONTHS.map((label, i) => {
    const inMonth = rows.filter(r => String(r.date || '').slice(5, 7) === String(i + 1).padStart(2, '0'));
    return { label, total: inMonth.reduce((a, r) => a + (r.usdEstimate || 0), 0), count: inMonth.length };
  });
  const monthPeak = Math.max(...monthly.map(m => m.total), 1);
  const busiest = [...monthly].sort((a, b) => b.total - a.total)[0];
  const active = monthly.filter(m => m.count > 0).length;

  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const share = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(0)}%` : '0%');

  return (
    <div className="mt-3 mb-5 ml-4 pl-4 border-l-2 border-indigo-100">
      <p className="text-sm text-gray-500 mb-4">
        {money(total)} over {rows.length} rows in {active} active {active === 1 ? 'month' : 'months'}
        {busiest.total > 0 && <> · heaviest was {busiest.label} at {money(busiest.total)}</>}
        {active > 0 && <> · {money(total / active)} a month on average</>}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Where it went
          </h3>
          <div className="space-y-1.5">
            {categories.map(([name, v]) => (
              <div key={name} className="flex items-baseline gap-2 text-sm">
                <span className="w-40 truncate text-gray-700">{name}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded overflow-hidden min-w-[2rem]">
                  <div className="h-full bg-indigo-400 rounded"
                    style={{ width: `${categories[0][1].total > 0 ? (v.total / categories[0][1].total) * 100 : 0}%` }} />
                </div>
                <span className="w-10 text-right text-xs text-gray-400 tabular-nums">{share(v.total)}</span>
                <span className="w-20 text-right font-medium text-gray-900 tabular-nums">{money(v.total)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Who took it
          </h3>
          <div className="space-y-1.5">
            {vendors.map(([name, v]) => (
              <button key={name} onClick={() => onVendor(name)}
                className="w-full flex items-baseline gap-2 text-sm text-left hover:bg-gray-50 rounded px-1 -mx-1 group">
                <span className="w-44 truncate text-gray-700 group-hover:text-indigo-600">{name}</span>
                <span className="flex-1 text-xs text-gray-400">{v.count} {v.count === 1 ? 'row' : 'rows'}</span>
                <span className="w-20 text-right font-medium text-gray-900 tabular-nums">{money(v.total)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-6 mb-2">
        Across {year}
      </h3>
      {/* Fixed twelve months, so a gap reads as a quiet month rather than being
          silently collapsed away. */}
      <div className="flex items-end gap-1 h-20">
        {monthly.map(m => (
          <div key={m.label} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            <div className="w-full bg-indigo-400 rounded-t transition-colors group-hover:bg-indigo-600"
              style={{ height: `${(m.total / monthPeak) * 100}%`, minHeight: m.total > 0 ? '2px' : '0' }} />
            <span className="text-[10px] text-gray-400 mt-1">{m.label}</span>
            {m.total > 0 && (
              <span className="absolute -top-5 hidden group-hover:block text-[10px] font-medium
                text-gray-900 bg-white border border-gray-200 rounded px-1 whitespace-nowrap z-10">
                {money(m.total)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
