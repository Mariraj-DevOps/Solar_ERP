import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, Clock, Edit2, Trash2, Copy, AlertTriangle, Users, Banknote, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { formatINR, round2 } from '../lib/calculations';
import { getTodayKolkataISO, formatDateDisplay } from '../lib/dateUtils';
import { AttendanceModal } from '../components/AttendanceModal';

export function DailyAttendancePage() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKolkataISO());
  const [entries, setEntries] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [entryList, teamList] = await Promise.all([
        api.attendance.list({ date: selectedDate }),
        api.teams.list(),
      ]);
      setEntries(entryList);
      setTeams(teamList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setEditingEntry(null);
    setModalOpen(true);
  };

  const handleEdit = (entry: any) => {
    setEditingEntry(entry);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this attendance entry? It will be logged in the audit trail.')) return;
    try {
      await api.attendance.delete(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  };

  const handleDuplicate = async (entry: any) => {
    try {
      await api.attendance.create({
        date: entry.date,
        teamId: entry.team_id,
        locationProject: entry.location_project,
        shiftBatch: `${entry.shift_batch} (Batch 2)`,
        inTime: entry.in_time,
        outTime: entry.out_time,
        overtimeHours: entry.overtime_hours,
        overtimeRate: entry.overtime_rate,
        overtimeAmount: entry.overtime_amount,
        remarks: entry.remarks ? `Duplicate: ${entry.remarks}` : '',
        lines: entry.lines?.map((l: any) => ({
          categoryId: l.category_id,
          categoryName: l.category_name,
          count: l.count,
          rate: l.rate,
          rateType: l.rate_type,
          calculatedAmount: l.calculated_amount,
          finalAmount: l.final_amount,
          isOverridden: l.is_overridden,
          overrideReason: l.override_reason,
        })),
      });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to duplicate');
    }
  };

  const totalWorkers = entries.reduce(
    (acc, e) => acc + (e.lines || []).reduce((s: number, l: any) => s + (l.count || 0), 0),
    0
  );
  const totalLabour = entries.reduce(
    (acc, e) => acc + (e.lines || []).reduce((s: number, l: any) => s + (l.final_amount || 0), 0),
    0
  );
  const totalOvertime = entries.reduce((acc, e) => acc + (e.overtime_amount || 0), 0);
  const dayNet = round2(totalLabour + totalOvertime);

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const term = search.toLowerCase();
    const t = teams.find((item) => item.id === e.team_id);
    return (
      (t?.name || '').toLowerCase().includes(term) ||
      (e.location_project || '').toLowerCase().includes(term) ||
      (e.remarks || '').toLowerCase().includes(term)
    );
  });

  const overviewCards = [
    {
      label: 'Selected Date',
      value: formatDateDisplay(selectedDate),
      sub: 'Asia/Kolkata timezone',
      icon: Calendar,
      accent: 'text-[#014025]',
      bg: 'bg-[#014025]/10',
      border: 'border-gray-100',
      dark: false,
    },
    {
      label: 'Workers Present',
      value: `${totalWorkers} Labourers`,
      sub: 'Count-based total',
      icon: Users,
      accent: 'text-[#456B5A]',
      bg: 'bg-[#456B5A]/10',
      border: 'border-gray-100',
      dark: false,
    },
    {
      label: 'Total Overtime',
      value: formatINR(totalOvertime),
      sub: 'Daily OT accrual',
      icon: TrendingUp,
      accent: 'text-[#696969]',
      bg: 'bg-[#696969]/10',
      border: 'border-gray-100',
      dark: false,
    },
    {
      label: 'Daily Labour Total',
      value: formatINR(dayNet),
      sub: 'Labour + OT',
      icon: Banknote,
      accent: 'text-white',
      bg: 'bg-white/15',
      border: 'border-transparent',
      dark: true,
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 animate-slide-in">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-[#456B5A]/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-[#456B5A]" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-[#014025] tracking-tight">
              Daily Attendance Management
            </h1>
          </div>
          <p className="text-xs text-[#696969] mt-1.5 ml-10">
            Count-based workforce recording: masons, helpers, painters, centring teams
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 transition-colors hover:border-gray-300 focus-within:ring-2 focus-within:ring-[#456B5A]/20 focus-within:border-[#456B5A]">
            <Calendar className="w-4 h-4 text-[#456B5A]" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-semibold text-[#014025] bg-transparent focus:outline-none"
            />
          </div>

          <button
            onClick={handleOpenNew}
            className="group flex items-center space-x-1.5 px-4 py-2 bg-[#014025] hover:bg-[#013520] text-white rounded-lg text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
          >
            <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
            <span>Add Attendance</span>
          </button>
        </div>
      </div>

      {/* Day Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {overviewCards.map((card, idx) => {
          const Icon = card.icon;
          const isDark = card.dark;
          return (
            <div
              key={card.label}
              className={`p-4 rounded-xl border shadow-sm hover:shadow-md transition-all duration-300 animate-slide-in ${
                isDark
                  ? 'bg-gradient-to-br from-[#014025] to-[#456B5A] text-white border-transparent'
                  : `bg-white ${card.border}`
              }`}
              style={{ animationDelay: `${0.05 * (idx + 1)}s` }}
            >
              <div className="flex items-center justify-between">
                <div className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-white/70' : 'text-[#696969]'}`}>
                  {card.label}
                </div>
                <div className={`w-7 h-7 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <Icon className={`w-3.5 h-3.5 ${card.accent}`} />
                </div>
              </div>
              <div className={`text-base font-bold font-mono mt-2 ${isDark ? 'text-white' : 'text-[#014025]'}`}>
                {card.value}
              </div>
              <div className={`text-[10px] mt-1 ${isDark ? 'text-white/60' : 'text-[#696969]/80'}`}>
                {card.sub}
              </div>
            </div>
          );
        })}
      </div>

      {/* Search Input */}
      <div className="flex items-center max-w-md animate-slide-in" style={{ animationDelay: '0.25s' }}>
        <div className="relative w-full group">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none transition-colors duration-200 group-focus-within:text-[#456B5A]" />
          <input
            type="text"
            placeholder="Search teams, locations, remarks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50/50 text-gray-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#456B5A]/20 focus:border-[#456B5A] focus:bg-white hover:border-gray-300"
          />
        </div>
      </div>

      {/* Entries List */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 flex flex-col items-center justify-center space-y-3 shadow-sm">
            <div className="w-8 h-8 border-2 border-[#456B5A]/20 border-t-[#456B5A] rounded-full animate-spin" />
            <p className="text-xs text-[#696969]">Loading attendance entries...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm animate-slide-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#456B5A]/10 mb-3">
              <Calendar className="w-6 h-6 text-[#456B5A]" />
            </div>
            <p className="text-sm font-semibold text-[#014025]">
              No attendance entries found for {formatDateDisplay(selectedDate)}
            </p>
            <p className="text-xs text-[#696969] mt-1">Create your first entry to start recording attendance.</p>
            <button
              onClick={handleOpenNew}
              className="mt-4 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#456B5A]/10 hover:bg-[#456B5A]/20 text-[#014025] rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Attendance Entry</span>
            </button>
          </div>
        ) : (
          filtered.map((entry, entryIdx) => {
            const team = teams.find((t) => t.id === entry.team_id);
            const teamLabourTotal = (entry.lines || []).reduce(
              (acc: number, l: any) => acc + (l.final_amount || 0),
              0
            );
            const hasOverrides = (entry.lines || []).some((l: any) => l.is_overridden);

            return (
              <div
                key={entry.id}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:border-[#456B5A]/30 hover:shadow-md transition-all duration-200 shadow-sm space-y-3 animate-row-in"
                style={{ animationDelay: `${entryIdx * 0.04}s` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-[#014025]">{team?.name || 'Team'}</span>
                    <span className="text-[10px] text-[#696969] bg-[#696969]/10 px-2 py-0.5 rounded-md font-medium">
                      {team?.work_category}
                    </span>
                    <span className="text-[10px] font-semibold text-[#456B5A] bg-[#456B5A]/10 px-2 py-0.5 rounded-md">
                      {entry.shift_batch}
                    </span>
                    {/* Status Badge */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        entry.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : entry.status === 'change_pending_approval'
                          ? 'bg-amber-100 text-amber-800'
                          : entry.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {entry.status === 'approved'
                        ? 'Approved'
                        : entry.status === 'change_pending_approval'
                        ? 'Revision Pending'
                        : entry.status === 'rejected'
                        ? 'Rejected'
                        : 'Pending Approval'}
                    </span>
                    {/* Admin Modified Flag */}
                    {Boolean(entry.admin_modified) && (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300"
                        title={`Modified after submission: ${entry.admin_modification_reason || 'Administrative change'}`}
                      >
                        Admin Modified
                      </span>
                    )}
                    {hasOverrides && (
                      <span className="flex items-center space-x-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        <span>Override</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-3 text-xs">
                    {entry.in_time && entry.out_time && (
                      <div className="flex items-center space-x-1 text-[#696969] font-mono text-[11px]">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span>{entry.in_time} – {entry.out_time}</span>
                      </div>
                    )}

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleDuplicate(entry)}
                        title="Duplicate"
                        className="p-1.5 text-gray-300 hover:text-[#456B5A] rounded-md hover:bg-[#456B5A]/10 transition-colors duration-150"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleEdit(entry)}
                        title="Edit"
                        className="p-1.5 text-gray-300 hover:text-[#014025] rounded-md hover:bg-[#014025]/10 transition-colors duration-150"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        title="Delete"
                        className="p-1.5 text-gray-300 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors duration-150"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Lines */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {(entry.lines || []).map((line: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs transition-colors ${
                        line.is_overridden
                          ? 'bg-amber-50/60 border-amber-200'
                          : 'bg-[#456B5A]/5 border-[#456B5A]/10'
                      }`}
                    >
                      <div className="flex justify-between font-semibold text-[#014025]">
                        <span>{line.category_name}</span>
                        <span className="font-mono">{line.count} Workers</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-[#696969] mt-1">
                        <span>Rate: ₹{line.rate}/day</span>
                        <span className="font-mono font-bold text-[#014025]">{formatINR(line.final_amount)}</span>
                      </div>
                      {line.is_overridden && (
                        <div className="text-[10px] text-amber-800 italic mt-1">
                          Reason: {line.override_reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Remarks & Totals */}
                <div className="flex flex-wrap items-center justify-between text-xs pt-2 border-t border-gray-100">
                  <div className="text-[#696969] italic">
                    {entry.remarks ? `Notes: ${entry.remarks}` : 'No notes'}
                  </div>
                  <div className="font-mono text-[#014025]">
                    Labour: <span className="font-bold">{formatINR(teamLabourTotal)}</span>
                    {entry.overtime_amount > 0 && (
                      <span className="text-[#456B5A] ml-2">
                        + OT: <span className="font-bold">{formatINR(entry.overtime_amount)}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <AttendanceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={loadData}
        initialDate={selectedDate}
        editEntry={editingEntry}
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
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
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
          animation: row-in 0.4s ease forwards;
        }
      `}</style>
    </div>
  );
}