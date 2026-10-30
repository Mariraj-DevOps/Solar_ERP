import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  RefreshCw,
  Search,
  Calendar,
  Building,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatINR, round2 } from '../lib/calculations';
import { formatDateDisplay, getTodayKolkataISO } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';

export function OfficeAccountsPage() {
  const { user, isMasterAdmin } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // New Ledger Entry Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(getTodayKolkataISO());
  const [referenceNo, setReferenceNo] = useState('');
  const [category, setCategory] = useState('Labour Payment');
  const [description, setDescription] = useState('');
  const [entryType, setEntryType] = useState<'credit' | 'debit'>('debit');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState('Bank Transfer');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadLedger = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.officeLedger.list({ category: categoryFilter || undefined });
      setEntries(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load accounts ledger.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, [categoryFilter]);

  const handleCreateEntry = async () => {
    if (!description.trim() || amount <= 0) {
      alert('Please enter a description and valid amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.officeLedger.create({
        entryDate,
        referenceNo,
        category,
        description,
        entryType,
        amount,
        paymentMode,
        notes,
      });

      setModalOpen(false);
      setDescription('');
      setAmount(0);
      setNotes('');
      await loadLedger();
    } catch (err: any) {
      alert(err.message || 'Failed to record ledger entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredEntries = entries.filter((e) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.description?.toLowerCase().includes(term) ||
      e.category?.toLowerCase().includes(term) ||
      e.reference_no?.toLowerCase().includes(term)
    );
  });

  const totalDebits = filteredEntries.filter((e) => e.entry_type === 'debit').reduce((s, e) => s + e.amount, 0);
  const totalCredits = filteredEntries.filter((e) => e.entry_type === 'credit').reduce((s, e) => s + e.amount, 0);
  const currentRunningBalance = entries.length > 0 ? entries[entries.length - 1].runningBalance : 0;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#696969]/20 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
            Master Accounts Ledger
          </h1>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            Restricted company financial ledger with double-entry running balance, bank transfers, and bills
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#014025] hover:bg-[#014025]/85 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Ledger Entry</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="text-xs text-[#696969] font-medium">Total Inflows (Credits)</div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{formatINR(totalCredits)}</div>
          <div className="text-[11px] text-emerald-600 mt-1">Capital deposits, client additions</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="text-xs text-[#696969] font-medium">Total Disbursements (Debits)</div>
          <div className="text-2xl font-bold font-mono text-red-700 mt-1">{formatINR(totalDebits)}</div>
          <div className="text-[11px] text-red-600 mt-1">Labour payouts, supplier bills, advances</div>
        </div>

        <div className="bg-[#014025] text-white p-4 rounded-xl shadow-xs">
          <div className="text-xs text-white/70 font-medium">Current Ledger Balance</div>
          <div className="text-2xl font-bold font-mono text-white mt-1">{formatINR(currentRunningBalance)}</div>
          <div className="text-[11px] text-white/80 mt-1">Calculated running balance</div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs">
          <Filter className="w-4 h-4 text-[#456B5A]" />
          <span className="font-semibold text-[#014025]">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border border-[#696969]/30 rounded px-2 py-1 bg-white text-xs text-[#014025]"
          >
            <option value="">All Categories</option>
            <option value="Labour Payment">Labour Payment</option>
            <option value="Supplier Bill">Supplier Bill</option>
            <option value="Advance Paid">Advance Paid</option>
            <option value="Advance Settlement">Advance Settlement</option>
            <option value="Material Purchase">Material Purchase</option>
            <option value="Client Inflow">Client Inflow</option>
            <option value="Office Expense">Office Expense</option>
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#696969] absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search description or ref..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#696969]/30 rounded-lg text-[#014025] focus:outline-none focus:ring-1 focus:ring-[#456B5A]"
          />
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl border border-[#696969]/20 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#696969]/10 text-[#014025] font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Ref No</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Payment Mode</th>
                <th className="py-2.5 px-3 text-right text-emerald-800">Credit (₹)</th>
                <th className="py-2.5 px-3 text-right text-red-800">Debit (₹)</th>
                <th className="py-2.5 px-3 text-right font-bold">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#696969]/15">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-[#696969]">
                    No ledger records found. Click &quot;New Ledger Entry&quot; to add transactions.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60 font-mono">
                    <td className="py-2.5 px-3 text-[#014025] font-sans font-medium">{formatDateDisplay(e.entry_date)}</td>
                    <td className="py-2.5 px-3 text-[#696969]">{e.reference_no || '--'}</td>
                    <td className="py-2.5 px-3 font-sans text-[#014025] font-semibold">{e.category}</td>
                    <td className="py-2.5 px-3 font-sans text-[#014025] max-w-xs truncate">{e.description}</td>
                    <td className="py-2.5 px-3 font-sans text-[#696969]">{e.payment_mode || 'Bank'}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                      {e.entry_type === 'credit' ? formatINR(e.amount) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-red-700">
                      {e.entry_type === 'debit' ? formatINR(e.amount) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#014025]">
                      {formatINR(e.runningBalance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Entry Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-[#014025] text-white font-bold text-sm flex items-center justify-between">
              <span>Record Ledger Transaction</span>
              <button onClick={() => setModalOpen(false)} className="text-white/70 hover:text-white">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">Date</label>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full border border-[#696969]/30 rounded p-1.5 font-mono text-xs text-[#014025]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">Ref / UTR No</label>
                  <input
                    type="text"
                    placeholder="e.g. UTR-998822"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full border border-[#696969]/30 rounded p-1.5 text-xs text-[#014025]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full border border-[#696969]/30 rounded p-1.5 text-xs text-[#014025] bg-white"
                  >
                    <option value="Labour Payment">Labour Payment</option>
                    <option value="Supplier Bill">Supplier Bill</option>
                    <option value="Advance Paid">Advance Paid</option>
                    <option value="Advance Settlement">Advance Settlement</option>
                    <option value="Material Purchase">Material Purchase</option>
                    <option value="Client Inflow">Client Inflow</option>
                    <option value="Office Expense">Office Expense</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">Type</label>
                  <select
                    value={entryType}
                    onChange={(e) => setEntryType(e.target.value as any)}
                    className="w-full border border-[#696969]/30 rounded p-1.5 text-xs text-[#014025] bg-white"
                  >
                    <option value="debit">Debit (Payment Out)</option>
                    <option value="credit">Credit (Inflow)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weekly labour disbursement for Centring Murugan"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded p-1.5 text-xs text-[#014025]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">
                    Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={amount || ''}
                    placeholder="0"
                    onChange={(e) => setAmount(Number(e.target.value) || 0)}
                    className="w-full border border-[#696969]/30 rounded p-1.5 font-mono text-sm font-bold text-[#014025]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full border border-[#696969]/30 rounded p-1.5 text-xs text-[#014025] bg-white"
                  >
                    <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Optional notes or voucher link"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded p-1.5 text-xs text-[#014025]"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-[#696969]/5 border-t border-[#696969]/15 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-3 py-1.5 text-xs border border-[#696969]/30 rounded-md text-[#696969] hover:bg-[#696969]/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateEntry}
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-[#014025] hover:bg-[#014025]/85 text-white rounded-md text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                {isSubmitting ? 'Recording...' : 'Record Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
