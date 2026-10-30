import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Clock, FileText, ChevronRight, RefreshCw, Paperclip, MessageSquare } from 'lucide-react';
import { api } from '../lib/api';
import { formatINR, round2 } from '../lib/calculations';
import { formatDateDisplay } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';

export function ApprovalQueuePage() {
  const { user, isMasterAdmin, isSecondaryAdmin } = useAuth();
  const [queue, setQueue] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

  // Rejection modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const loadQueue = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.attendance.getQueue();
      setQueue(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load approval queue.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleApprove = async (entry: any) => {
    if (!window.confirm(`Approve attendance entry for ${entry.team_name} on ${formatDateDisplay(entry.date)}?`)) {
      return;
    }
    setIsProcessing(true);
    try {
      await api.attendance.approve(entry.id);
      await loadQueue();
      setSelectedEntry(null);
    } catch (err: any) {
      alert(err.message || 'Approval failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      alert('Please enter a mandatory rejection reason.');
      return;
    }
    if (!selectedEntry) return;

    setIsProcessing(true);
    try {
      await api.attendance.reject(selectedEntry.id, rejectionReason.trim());
      setRejectModalOpen(false);
      setRejectionReason('');
      setSelectedEntry(null);
      await loadQueue();
    } catch (err: any) {
      alert(err.message || 'Rejection failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const pendingSubmissions = queue.filter((e) => e.status === 'pending_approval');
  const pendingRevisions = queue.filter((e) => e.status === 'change_pending_approval');

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#696969]/20 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#014025] tracking-tight">
            Attendance Approval Queue
          </h1>
          <p className="text-xs sm:text-sm text-[#696969] mt-0.5">
            Review and authorize newly submitted labour attendance entries and proposed revisions
          </p>
        </div>
        <button
          onClick={loadQueue}
          disabled={isLoading}
          className="self-start sm:self-auto flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#456B5A]/30 text-xs font-semibold text-[#014025] hover:bg-[#456B5A]/10 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-[#696969] font-medium">Pending New Submissions</div>
            <div className="text-2xl font-bold font-mono text-[#014025] mt-1">{pendingSubmissions.length}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#456B5A]/10 text-[#456B5A] flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-[#696969] font-medium">Pending Revisions (Edits)</div>
            <div className="text-2xl font-bold font-mono text-amber-600 mt-1">{pendingRevisions.length}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#696969]/20 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-[#696969] font-medium">Assigned Scope</div>
            <div className="text-sm font-semibold text-[#014025] mt-1">
              {isMasterAdmin ? 'Company-wide (All Staff)' : 'Assigned Staff Workspaces'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#014025]/10 text-[#014025] flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Queue Listing */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-[#696969]/20 p-12 text-center text-xs text-[#696969]">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#456B5A] mb-2" />
          Loading pending attendance items...
        </div>
      ) : queue.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#696969]/20 p-12 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <div className="font-semibold text-sm text-[#014025]">All Caught Up!</div>
          <div className="text-xs text-[#696969]">
            There are no attendance submissions or revisions pending approval in your assigned scope.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((entry) => {
            const isRevision = entry.status === 'change_pending_approval';
            const totalLinesCount = entry.lines ? entry.lines.reduce((acc: number, l: any) => acc + l.count, 0) : 0;
            const totalLabourAmt = entry.lines ? entry.lines.reduce((acc: number, l: any) => acc + (l.final_amount || 0), 0) : 0;
            const totalEntryPayable = round2(totalLabourAmt + (entry.overtime_amount || 0));

            return (
              <div
                key={entry.id}
                className={`bg-white rounded-xl border shadow-xs transition-all overflow-hidden ${
                  isRevision ? 'border-amber-300' : 'border-[#696969]/20'
                }`}
              >
                {/* Entry Banner */}
                <div className="px-4 py-3 bg-[#696969]/5 border-b border-[#696969]/15 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isRevision ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {isRevision ? 'Proposed Revision' : 'New Submission'}
                    </span>
                    <span className="font-semibold text-xs text-[#014025]">
                      Staff: <span className="text-[#456B5A]">{entry.staff_name}</span>
                    </span>
                    <span className="text-[#696969]/60 text-xs">•</span>
                    <span className="text-xs text-[#696969]">
                      Date: <span className="font-mono font-medium text-[#014025]">{formatDateDisplay(entry.date)}</span>
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleApprove(entry)}
                      disabled={isProcessing}
                      className="px-3 py-1 bg-[#014025] hover:bg-[#014025]/85 text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedEntry(entry);
                        setRejectionReason('');
                        setRejectModalOpen(true);
                      }}
                      disabled={isProcessing}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>

                {/* Entry Details */}
                <div className="p-4 space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <div className="text-[11px] text-[#696969]">Team &amp; Location</div>
                      <div className="font-semibold text-[#014025]">{entry.team_name}</div>
                      <div className="text-[11px] text-[#696969]">{entry.location_project || 'General Site'} ({entry.shift_batch})</div>
                    </div>

                    <div>
                      <div className="text-[11px] text-[#696969]">Working Time &amp; Overtime</div>
                      <div className="font-mono text-[#014025]">
                        {entry.in_time || '--'} - {entry.out_time || '--'}
                      </div>
                      <div className="text-[11px] text-[#696969]">
                        OT: {entry.overtime_hours} hrs ({formatINR(entry.overtime_amount || 0)})
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-[#696969]">Calculated Payable</div>
                      <div className="font-mono text-base font-bold text-[#014025]">{formatINR(totalEntryPayable)}</div>
                      <div className="text-[11px] text-[#696969]">
                        {totalLinesCount} Workers across {entry.lines?.length || 0} categories
                      </div>
                    </div>
                  </div>

                  {/* Change Reason Banner if Revision */}
                  {isRevision && entry.change_reason && (
                    <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs flex items-start space-x-2">
                      <MessageSquare className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                      <div>
                        <span className="font-semibold">Reason for Proposed Change: </span>
                        <span>{entry.change_reason}</span>
                      </div>
                    </div>
                  )}

                  {/* Remarks */}
                  {entry.remarks && (
                    <div className="text-xs text-[#696969] bg-[#696969]/5 p-2 rounded">
                      <span className="font-medium text-[#014025]">Remarks: </span>
                      {entry.remarks}
                    </div>
                  )}

                  {/* Category Breakdown Table */}
                  <div className="border border-[#696969]/15 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-[#696969]/10 text-[#014025] font-semibold">
                        <tr>
                          <th className="py-1.5 px-3 text-left">Category</th>
                          <th className="py-1.5 px-3 text-center w-20">Count</th>
                          <th className="py-1.5 px-3 text-right w-24">Rate</th>
                          <th className="py-1.5 px-3 text-right w-28">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#696969]/10 font-mono">
                        {entry.lines?.map((line: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3 font-sans text-[#014025] font-medium">{line.category_name}</td>
                            <td className="py-1.5 px-3 text-center font-bold text-[#014025]">{line.count}</td>
                            <td className="py-1.5 px-3 text-right text-[#696969]">₹{line.rate}</td>
                            <td className="py-1.5 px-3 text-right font-semibold text-[#014025]">
                              {formatINR(line.final_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mandatory Rejection Reason Dialog */}
      {rejectModalOpen && selectedEntry && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-red-600 text-white font-bold text-sm flex items-center justify-between">
              <span>Reject Attendance Submission</span>
              <button onClick={() => setRejectModalOpen(false)} className="text-white/80 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <p className="text-[#696969]">
                Please enter a mandatory rejection reason for{' '}
                <strong className="text-[#014025]">{selectedEntry.staff_name}</strong> on{' '}
                <strong className="text-[#014025]">{formatDateDisplay(selectedEntry.date)}</strong>. This will be
                logged in the audit history and sent as an in-app notification.
              </p>
              <div>
                <label className="block text-xs font-semibold text-[#014025] mb-1">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Overtime hours do not match biometric security log; please verify with site supervisor."
                  className="w-full border border-[#696969]/30 rounded-md p-2.5 text-xs text-[#014025] focus:ring-1 focus:ring-red-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="px-5 py-3 bg-[#696969]/5 border-t border-[#696969]/15 flex items-center justify-end space-x-2">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="px-3 py-1.5 text-xs border border-[#696969]/30 rounded-md text-[#696969] hover:bg-[#696969]/10"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={isProcessing || !rejectionReason.trim()}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                {isProcessing ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
