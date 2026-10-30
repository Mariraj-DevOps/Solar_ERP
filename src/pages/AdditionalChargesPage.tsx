import React, { useState, useEffect } from 'react';
import { Plus, ReceiptIndianRupee, Trash2, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { formatINR } from '../lib/calculations';
import { getTodayKolkataISO, getWeekBounds, formatDateDisplay } from '../lib/dateUtils';
import { WeekNavigator } from '../components/WeekNavigator';
import { ChargeModal } from '../components/ChargeModal';

export function AdditionalChargesPage() {
  const [currentWeekStart, setCurrentWeekStart] = useState<string>(() => {
    return getWeekBounds(getTodayKolkataISO()).startDate;
  });
  const [charges, setCharges] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, [currentWeekStart]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [chgList, teamList] = await Promise.all([
        api.charges.list({ weekStart: currentWeekStart }),
        api.teams.list(),
      ]);
      setCharges(chgList);
      setTeams(teamList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this charge? It will be logged in the audit trail.')) return;
    try {
      await api.charges.delete(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete charge');
    }
  };

  const totalCharges = charges.reduce((acc, c) => acc + (c.final_amount || 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 animate-slide-in">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-[#456B5A]/10 flex items-center justify-center">
              <ReceiptIndianRupee className="w-4 h-4 text-[#456B5A]" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-[#014025] tracking-tight">
              Additional Charges &amp; Expenses
            </h1>
          </div>
          <p className="text-xs text-[#696969] mt-1.5 ml-10">
            Machine rentals, materials, steel blades, transport trips, and custom site expenses
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <WeekNavigator
            currentWeekStart={currentWeekStart}
            onWeekChange={(newWeek) => setCurrentWeekStart(newWeek)}
          />

          <button
            onClick={() => setModalOpen(true)}
            className="group flex items-center space-x-1.5 px-4 py-2 bg-[#014025] hover:bg-[#013520] text-white rounded-lg text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
          >
            <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
            <span>Add Extra Charge</span>
          </button>
        </div>
      </div>

      {/* Metric Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#014025] to-[#456B5A] text-white p-5 rounded-xl shadow-md animate-slide-in" style={{ animationDelay: '0.1s' }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white rounded-full blur-2xl" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white rounded-full blur-2xl" />
        </div>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs text-white/70 font-medium">Total Weekly Additional Charges</div>
              <div className="text-xs text-white/90 mt-0.5 flex items-center space-x-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300" />
                <span>{charges.length} line item{charges.length !== 1 ? 's' : ''} recorded</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold font-mono text-white tracking-tight">{formatINR(totalCharges)}</div>
          </div>
        </div>
      </div>

      {/* Charges Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 animate-slide-in" style={{ animationDelay: '0.2s' }}>
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#456B5A]/20 border-t-[#456B5A] rounded-full animate-spin" />
            <p className="text-xs text-[#696969]">Loading charges...</p>
          </div>
        ) : charges.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#456B5A]/10 mb-3">
              <ReceiptIndianRupee className="w-6 h-6 text-[#456B5A]" />
            </div>
            <p className="text-sm font-semibold text-[#014025]">No additional charges recorded</p>
            <p className="text-xs text-[#696969] mt-1">Add your first charge for this week to get started.</p>
            <button
              onClick={() => setModalOpen(true)}
              className="mt-4 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#456B5A]/10 hover:bg-[#456B5A]/20 text-[#014025] rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Charge</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#456B5A]/5 text-[#014025] font-bold border-b border-gray-100">
                  <th className="py-3 px-3 font-semibold">Date</th>
                  <th className="py-3 px-3 font-semibold">Team</th>
                  <th className="py-3 px-3 font-semibold">Category</th>
                  <th className="py-3 px-3 font-semibold">Description</th>
                  <th className="py-3 px-3 text-right font-semibold">Quantity / Unit</th>
                  <th className="py-3 px-3 text-right font-semibold">Rate (₹)</th>
                  <th className="py-3 px-3 text-right font-semibold">Final Amount (₹)</th>
                  <th className="py-3 px-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-mono text-[11px] sm:text-xs">
                {charges.map((chg, idx) => {
                  const team = teams.find((t) => t.id === chg.team_id);
                  return (
                    <tr
                      key={chg.id}
                      className="hover:bg-[#456B5A]/5 transition-colors duration-150 animate-row-in"
                      style={{ animationDelay: `${idx * 0.03}s` }}
                    >
                      <td className="py-3 px-3 font-sans text-[#696969]">
                        {chg.date ? formatDateDisplay(chg.date) : 'Weekly'}
                      </td>
                      <td className="py-3 px-3 font-sans font-semibold text-[#014025]">
                        {team?.name || 'Team'}
                      </td>
                      <td className="py-3 px-3 font-sans">
                        <span className="bg-[#456B5A]/10 text-[#014025] px-2 py-0.5 rounded-md text-[10px] font-semibold">
                          {chg.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-sans text-gray-800">
                        {chg.description}
                        {chg.remarks && (
                          <span className="block text-[10px] text-[#696969] italic mt-0.5">
                            Note: {chg.remarks}
                          </span>
                        )}
                        {chg.is_overridden === 1 && (
                          <span className="inline-flex items-center space-x-1 mt-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            <AlertCircle className="w-3 h-3" />
                            <span>Override: {chg.override_reason}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-[#696969]">
                        {chg.quantity ? `${chg.quantity} ${chg.unit || ''}` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-[#696969]">
                        {chg.rate ? formatINR(chg.rate) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-[#014025]">
                        {formatINR(chg.final_amount)}
                      </td>
                      <td className="py-3 px-3 text-center font-sans">
                        <button
                          onClick={() => handleDelete(chg.id)}
                          className="text-gray-300 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors duration-150"
                          title="Delete charge"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ChargeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={loadData}
        weekStartDate={currentWeekStart}
      />

      {/* Custom animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes row-in {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease forwards;
        }
        .animate-slide-in {
          opacity: 0;
          animation: slide-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-row-in {
          opacity: 0;
          animation: row-in 0.35s ease forwards;
        }
      `}</style>
    </div>
  );
}