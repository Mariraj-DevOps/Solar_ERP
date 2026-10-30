import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Calendar,
  AlertCircle,
  Building,
  Trash2,
  Search,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../lib/api';
import { formatINR, round2 } from '../lib/calculations';
import { formatDateDisplay, getTodayKolkataISO } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';

export function PettyCashPage() {
  const { user, isMasterAdmin, isSecondaryAdmin } = useAuth();
  const [data, setData] = useState<{
    openingBalances: { openingInAccount: number; openingInHand: number };
    entries: any[];
    currentAccountBalance: number;
    currentHandBalance: number;
    totalAvailableFunds: number;
  }>({
    openingBalances: { openingInAccount: 75000, openingInHand: 25000 },
    entries: [],
    currentAccountBalance: 75000,
    currentHandBalance: 25000,
    totalAvailableFunds: 100000,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Month & Year state
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');

  // New Transaction Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState(getTodayKolkataISO());
  const [serialNo, setSerialNo] = useState('');
  const [description, setDescription] = useState('');
  const [txType, setTxType] = useState<'credit' | 'debit'>('debit');
  const [channel, setChannel] = useState<'cash' | 'online'>('cash');
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPettyCash = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.pettyCash.get({ month: selectedMonth, year: selectedYear });
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load petty cash data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPettyCash();
  }, [selectedMonth, selectedYear]);

  const handleCreateTransaction = async () => {
    if (!description.trim()) {
      alert('Please enter a transaction description.');
      return;
    }
    if (amount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.pettyCash.create({
        date,
        serialNo,
        description,
        creditAmount: txType === 'credit' ? amount : 0,
        debitAmount: txType === 'debit' ? amount : 0,
        onlineAmount: channel === 'online' ? amount : 0,
        channel,
        notes,
      });

      setModalOpen(false);
      setDescription('');
      setAmount(0);
      setNotes('');
      await loadPettyCash();
    } catch (err: any) {
      alert(err.message || 'Failed to record petty cash entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this petty cash entry?')) return;
    try {
      await api.pettyCash.delete(id);
      await loadPettyCash();
    } catch (err: any) {
      alert(err.message || 'Failed to delete entry.');
    }
  };

  // Export to Excel matching "Petty Cash - Oct 2026" sheet structure
  const exportToExcel = () => {
    const rows = data.entries.map((e, idx) => ({
      'S.No': idx + 1,
      'Date': formatDateDisplay(e.date),
      'Ref / Serial No': e.serial_no || '',
      'Description': e.description,
      'Credit (Received ₹)': e.credit_amount || 0,
      'Debit (Paid ₹)': e.debit_amount || 0,
      'Online Tx (₹)': e.online_amount || 0,
      'Channel': e.channel === 'online' ? 'Online / Account' : 'Cash in Hand',
      'Day Balance (₹)': e.dayBalance || 0,
      'Cash in Account (₹)': e.cashInAccount || 0,
      'Cash in Hand (₹)': e.cashInHand || 0,
      'Total Available Funds (₹)': e.totalFunds || 0,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Petty Cash - ${selectedMonth}-${selectedYear}`);
    XLSX.writeFile(wb, `Petty_Cash_${selectedMonth}_${selectedYear}.xlsx`);
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(`Company Petty Cash Ledger — ${selectedMonth}/${selectedYear}`, 14, 15);
    doc.setFontSize(9);
    doc.text(`Opening Account: ₹${data.openingBalances.openingInAccount} | Opening Hand: ₹${data.openingBalances.openingInHand}`, 14, 22);

    const tableData = data.entries.map((e, idx) => [
      idx + 1,
      formatDateDisplay(e.date),
      e.description,
      e.credit_amount ? formatINR(e.credit_amount) : '-',
      e.debit_amount ? formatINR(e.debit_amount) : '-',
      e.channel === 'online' ? 'Online' : 'Cash',
      formatINR(e.cashInAccount),
      formatINR(e.cashInHand),
      formatINR(e.totalFunds),
    ]);

    autoTable(doc, {
      startY: 26,
      head: [['#', 'Date', 'Description', 'Credit', 'Debit', 'Mode', 'In Account', 'In Hand', 'Total Funds']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [1, 64, 37] },
    });

    doc.save(`Petty_Cash_${selectedMonth}_${selectedYear}.pdf`);
  };

  const filteredEntries = data.entries.filter((e) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.description?.toLowerCase().includes(term) ||
      e.serial_no?.toLowerCase().includes(term) ||
      e.notes?.toLowerCase().includes(term)
    );
  });

  const totalCredits = filteredEntries.reduce((sum, e) => sum + (e.credit_amount || 0), 0);
  const totalDebits = filteredEntries.reduce((sum, e) => sum + (e.debit_amount || 0), 0);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#696969]/20 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
            Petty Cash &amp; Office Expenses Ledger
          </h1>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            Daily cash in hand &amp; bank transactions reconciliation based on company office ledger rules
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportToExcel}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#456B5A]/30 text-xs font-semibold text-[#014025] hover:bg-[#456B5A]/10 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={exportToPDF}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#456B5A]/30 text-xs font-semibold text-[#014025] hover:bg-[#456B5A]/10 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-red-700" />
            <span>Export PDF</span>
          </button>

          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#014025] hover:bg-[#014025]/85 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Transaction</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Balances Card Grid matching "for software.xlsx" */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="text-xs text-[#696969] font-medium">Opening Balance (In Account)</div>
          <div className="text-xl font-bold font-mono text-[#014025] mt-1">
            {formatINR(data.openingBalances.openingInAccount)}
          </div>
          <div className="text-[11px] text-[#696969] mt-0.5">Bank / Online Account</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="text-xs text-[#696969] font-medium">Opening Balance (In Hand)</div>
          <div className="text-xl font-bold font-mono text-[#014025] mt-1">
            {formatINR(data.openingBalances.openingInHand)}
          </div>
          <div className="text-[11px] text-[#696969] mt-0.5">Physical Cash in Hand</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs">
          <div className="text-xs text-[#696969] font-medium">Current Cash in Hand</div>
          <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
            {formatINR(data.currentHandBalance)}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Running Physical Cash</div>
        </div>

        <div className="bg-[#014025] text-white p-4 rounded-xl shadow-xs">
          <div className="text-xs text-white/70 font-medium">Total Available Funds</div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {formatINR(data.totalAvailableFunds)}
          </div>
          <div className="text-[11px] text-white/80 mt-0.5">Account (₹{round2(data.currentAccountBalance)}) + Cash</div>
        </div>
      </div>

      {/* Month Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs">
          <Calendar className="w-4 h-4 text-[#456B5A]" />
          <span className="font-semibold text-[#014025]">Month:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="border border-[#696969]/30 rounded px-2 py-1 bg-white text-xs text-[#014025]"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2026, i, 1).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="border border-[#696969]/30 rounded px-2 py-1 bg-white text-xs text-[#014025]"
          >
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
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
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3 text-right text-emerald-800">Credit (Received)</th>
                <th className="py-2.5 px-3 text-right text-red-800">Debit (Paid)</th>
                <th className="py-2.5 px-3 text-center">Channel</th>
                <th className="py-2.5 px-3 text-right">Day Balance</th>
                <th className="py-2.5 px-3 text-right">Cash in Account</th>
                <th className="py-2.5 px-3 text-right">Cash in Hand</th>
                <th className="py-2.5 px-2 text-center w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#696969]/15">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-xs text-[#696969]">
                    No petty cash transactions recorded for this period. Click &quot;New Transaction&quot; to add.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60 font-mono">
                    <td className="py-2 px-3 text-[#014025] font-sans font-medium">{formatDateDisplay(e.date)}</td>
                    <td className="py-2 px-3 text-[#696969]">{e.serial_no || '--'}</td>
                    <td className="py-2 px-3 text-[#014025] font-sans max-w-xs truncate">{e.description}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700">
                      {e.credit_amount > 0 ? formatINR(e.credit_amount) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-red-700">
                      {e.debit_amount > 0 ? formatINR(e.debit_amount) : '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-sans">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          e.channel === 'online' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {e.channel === 'online' ? 'Online' : 'Cash'}
                      </span>
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-semibold ${
                        e.dayBalance >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {formatINR(e.dayBalance)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-[#014025]">
                      {formatINR(e.cashInAccount)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-[#014025]">
                      {formatINR(e.cashInHand)}
                    </td>
                    <td className="py-2 px-2 text-center font-sans">
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="text-[#696969] hover:text-red-500 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredEntries.length > 0 && (
              <tfoot className="bg-[#696969]/10 font-bold font-mono text-[#014025]">
                <tr>
                  <td colSpan={3} className="py-2 px-3 font-sans">Period Totals</td>
                  <td className="py-2 px-3 text-right text-emerald-800">{formatINR(totalCredits)}</td>
                  <td className="py-2 px-3 text-right text-red-800">{formatINR(totalDebits)}</td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* New Transaction Dialog */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-[#014025] text-white font-bold text-sm flex items-center justify-between">
              <span>New Petty Cash Entry</span>
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
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full border border-[#696969]/30 rounded p-1.5 font-mono text-xs text-[#014025]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">Serial / Ref No</label>
                  <input
                    type="text"
                    placeholder="e.g. PC-01"
                    value={serialNo}
                    onChange={(e) => setSerialNo(e.target.value)}
                    className="w-full border border-[#696969]/30 rounded p-1.5 text-xs text-[#014025]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Site tea and snacks for labour team"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-[#696969]/30 rounded p-1.5 text-xs text-[#014025]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">Transaction Type</label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as any)}
                    className="w-full border border-[#696969]/30 rounded p-1.5 text-xs text-[#014025] bg-white"
                  >
                    <option value="debit">Debit (Paid Out)</option>
                    <option value="credit">Credit (Received In)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#014025] mb-1">Channel</label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as any)}
                    className="w-full border border-[#696969]/30 rounded p-1.5 text-xs text-[#014025] bg-white"
                  >
                    <option value="cash">Cash in Hand</option>
                    <option value="online">Online / Account Transfer</option>
                  </select>
                </div>
              </div>

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
                <label className="block text-xs font-semibold text-[#014025] mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Optional notes"
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
                onClick={handleCreateTransaction}
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-[#014025] hover:bg-[#014025]/85 text-white rounded-md text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Record Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
