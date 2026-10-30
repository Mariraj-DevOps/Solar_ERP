import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editTeam?: any;
}

export function TeamModal({ isOpen, onClose, onSuccess, editTeam }: TeamModalProps) {
  const [name, setName] = useState('');
  const [workCategory, setWorkCategory] = useState('');
  const [locationProject, setLocationProject] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [notes, setNotes] = useState('');
  const [roles, setRoles] = useState<Array<{ categoryId: string; defaultRate: number; rateType: string }>>([]);
  const [availableCategories, setAvailableCategories] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      if (editTeam) {
        setName(editTeam.name);
        setWorkCategory(editTeam.work_category);
        setLocationProject(editTeam.location_project || '');
        setStatus(editTeam.status || 'active');
        setNotes(editTeam.notes || '');
        if (editTeam.roles) {
          setRoles(
            editTeam.roles.map((r: any) => ({
              categoryId: r.category_id,
              defaultRate: r.default_rate,
              rateType: r.rate_type || 'daily',
            }))
          );
        }
      } else {
        setName('');
        setWorkCategory('');
        setLocationProject('');
        setStatus('active');
        setNotes('');
        setRoles([]);
      }
    }
  }, [isOpen, editTeam]);

  const loadCategories = async () => {
    try {
      const cats = await api.categories.list();
      setAvailableCategories(cats);
    } catch (err: any) {
      console.error(err);
    }
  };

  const addRole = () => {
    if (availableCategories.length === 0) return;
    const cat = availableCategories[0];
    setRoles((prev) => [
      ...prev,
      {
        categoryId: cat.id,
        defaultRate: cat.default_rate || 1000,
        rateType: cat.rate_type || 'daily',
      },
    ]);
  };

  const removeRole = (index: number) => {
    setRoles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateRole = (index: number, field: string, val: any) => {
    setRoles((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !workCategory.trim()) {
      setError('Team name and work category are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        workCategory: workCategory.trim(),
        locationProject: locationProject.trim() || null,
        status,
        notes: notes.trim() || null,
        roles,
      };

      if (editTeam) {
        await api.teams.update(editTeam.id, payload);
      } else {
        await api.teams.create(payload);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save team');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#696969]/20 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 bg-white border-b-2 border-[#456B5A] flex items-center justify-between">
          <h2 className="font-bold text-sm sm:text-base tracking-tight text-[#014025]">
            {editTeam ? 'Edit Team Template' : 'Create New Team Template'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-[#696969] hover:text-[#014025] hover:bg-[#696969]/10 rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#014025] mb-1">
              Team / Contractor Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Centring Murugan, Heeralal / Lumia Building, Ali Carpenter"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#014025] mb-1">
                Work Category *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Civil, Painting, Centring, Cleaning"
                value={workCategory}
                onChange={(e) => setWorkCategory(e.target.value)}
                className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#014025] mb-1">
                Project / Site Location
              </label>
              <input
                type="text"
                placeholder="e.g. Main Tower, Block A"
                value={locationProject}
                onChange={(e) => setLocationProject(e.target.value)}
                className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#014025] mb-1">Notes / Description</label>
            <textarea
              rows={2}
              placeholder="Optional notes or contractual conditions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-[#696969]/30 rounded-md px-3 py-2 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-xs text-[#014025]">
                Default Labour Roles &amp; Rates (Reusable Template)
              </span>
              <button
                type="button"
                onClick={addRole}
                className="flex items-center space-x-1 text-xs font-medium text-[#014025] bg-[#014025]/10 hover:bg-[#014025]/20 border border-[#014025]/20 px-2.5 py-1 rounded transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Role</span>
              </button>
            </div>

            <div className="space-y-2">
              {roles.map((r, idx) => (
                <div key={idx} className="flex items-center space-x-2 bg-[#696969]/5 border border-[#696969]/15 rounded p-2">
                  <select
                    value={r.categoryId}
                    onChange={(e) => updateRole(idx, 'categoryId', e.target.value)}
                    className="flex-1 border border-[#696969]/30 rounded px-2 py-1 text-xs bg-white text-[#014025] focus:ring-1 focus:ring-[#456B5A] focus:outline-none"
                  >
                    {availableCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center space-x-1">
                    <span className="text-[#696969] text-xs">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={r.defaultRate}
                      onChange={(e) => updateRole(idx, 'defaultRate', Number(e.target.value) || 0)}
                      className="w-20 border border-[#696969]/30 rounded px-2 py-1 text-xs text-right font-mono bg-white text-[#014025] font-semibold"
                    />
                    <span className="text-[10px] text-[#696969]">/day</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeRole(idx)}
                    className="text-slate-400 hover:text-rose-600 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-[#696969]/15 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#696969]/30 text-[#696969] rounded-md text-xs font-medium hover:bg-[#696969]/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-[#014025] hover:bg-[#014025]/80 text-white rounded-md text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : editTeam ? 'Update Team' : 'Save Team Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
