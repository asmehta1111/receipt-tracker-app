'use client';

// Force rebuild
import { useState, useEffect } from 'react';
import { PieChart, Pie, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { LogOut, Plus, Edit2, Trash2, Filter, Search, X } from 'lucide-react';

// Deep, high-saturation hues that stay distinguishable with red-green colour
// vision deficiency — blue / indigo / teal / orange / rose, never two neighbours.
const COLORS = ['#1D4ED8', '#0F766E', '#EA580C', '#BE123C', '#6D28D9', '#0369A1',
                '#A16207', '#9F1239', '#4338CA', '#115E59'];

export default function Dashboard() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
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

  const filteredReceipts = receipts.filter(r => {
    const matchesCategory = !filterCategory || r.category === filterCategory;
    const matchesSearch = !searchQuery ||
      r.vendor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.date.includes(searchQuery) ||
      r.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categories = [...new Set(receipts.map(r => r.category).filter(Boolean))];

  // Category -> vendor -> receipts, computed client-side so drilling is instant.
  const nonExpense: string[] = analytics?.nonExpenseCategories || [];
  const breakdown = (() => {
    const scoped = receipts.filter(r => {
      const excluded = nonExpense.includes(r.category);
      return breakdownScope === 'all' ? true : breakdownScope === 'excluded' ? excluded : !excluded;
    });
    const total = scoped.reduce((s, r) => s + (r.usdEstimate || 0), 0);

    const cats = new Map<string, any>();
    for (const r of scoped) {
      const cat = r.category || '(uncategorised)';
      if (!cats.has(cat)) cats.set(cat, { name: cat, total: 0, count: 0, vendors: new Map() });
      const c = cats.get(cat);
      c.total += r.usdEstimate || 0;
      c.count += 1;

      const vendor = r.vendor || '(no vendor)';
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
          <div className="flex gap-8">
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
        {activeTab === 'dashboard' && analytics && (
          <div className="space-y-8">
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-6">
                <p className="text-gray-600 text-sm font-medium">Total Spend (USD)</p>
                <p className="text-3xl font-bold text-gray-900">${analytics.totalSpend.toLocaleString()}</p>
                {analytics.excluded?.count > 0 && (
                  <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                    <p>
                      excludes {analytics.excluded.count} rows
                      (${Math.round(analytics.excluded.total).toLocaleString()}) —
                    </p>
                    {analytics.excluded.byCategory.map((c: any) => (
                      <button
                        key={c.name}
                        onClick={() => drillIntoCategory(c.name)}
                        className="block pl-2 text-left hover:text-indigo-600 hover:underline"
                      >
                        {c.name}: {c.count} rows, ${Math.round(c.total).toLocaleString()}
                      </button>
                    ))}
                  </div>
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
            {(filterCategory || searchQuery) && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="text-sm text-indigo-900">
                  Showing <strong>{filteredReceipts.length}</strong> of {receipts.length} receipts
                  {filterCategory && <> in <strong>{filterCategory}</strong></>}
                  {searchQuery && <> matching <strong>&ldquo;{searchQuery}&rdquo;</strong></>}
                  {' · '}
                  <strong>
                    ${Math.round(filteredReceipts.reduce((s, r) => s + (r.usdEstimate || 0), 0)).toLocaleString()}
                  </strong>
                </span>
                <button
                  onClick={() => { setFilterCategory(''); setSearchQuery(''); }}
                  className="ml-auto text-sm text-indigo-700 hover:text-indigo-900 underline"
                >
                  Clear filter
                </button>
              </div>
            )}

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
                  </tr>
                </thead>
                <tbody>
                  {filteredReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500">
                        No receipts found
                      </td>
                    </tr>
                  ) : (
                    filteredReceipts.map((receipt, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
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
                            <span className="font-medium">{receipt.vendor}</span>
                            <button
                              onClick={() => setRenameModal({ oldName: receipt.vendor, newName: receipt.vendor })}
                              className="text-gray-400 hover:text-indigo-600 transition"
                              title="Rename vendor"
                            >
                              <Edit2 size={16} />
                            </button>
                          </div>
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
                                      <tr key={i} className="border-t border-gray-100">
                                        <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap w-24">{r.date}</td>
                                        <td className="py-1.5 pr-3 text-gray-700">{r.subject}</td>
                                        <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap w-32">
                                          {r.emailAccount?.split('@')[0]}
                                        </td>
                                        <td className="py-1.5 text-right text-gray-900 whitespace-nowrap w-28">
                                          {r.currency} {r.amount?.toLocaleString()}
                                          {r.currency !== 'USD' && (
                                            <span className="text-gray-400"> (${Math.round(r.usdEstimate).toLocaleString()})</span>
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
