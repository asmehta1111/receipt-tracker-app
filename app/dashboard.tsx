'use client';

import { useState, useEffect } from 'react';
import { PieChart, Pie, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { LogOut, Plus, Edit2, Trash2, Filter, Search, X } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7C7C', '#A4DE6C', '#D084D0'];

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

  useEffect(() => {
    fetchData();
  }, []);

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
                    >
                      {analytics.byCategory.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
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
                    <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
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
                    <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
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
      </main>
    </div>
  );
}
