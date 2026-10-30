import React, { useState, useEffect } from 'react';
import { Plus, Building, Search, Edit2, ShieldAlert, Users, Tag, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { formatINR } from '../lib/calculations';
import { TeamModal } from '../components/TeamModal';

export function TeamsPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any | null>(null);

  // New Category inline creation state
  const [newCatName, setNewCatName] = useState('');
  const [newCatRate, setNewCatRate] = useState('1000');
  const [showAddCat, setShowAddCat] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tList, cList] = await Promise.all([api.teams.list(), api.categories.list()]);
      setTeams(tList);
      setCategories(cList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewTeam = () => {
    setEditingTeam(null);
    setModalOpen(true);
  };

  const handleEditTeam = (team: any) => {
    setEditingTeam(team);
    setModalOpen(true);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await api.categories.create({
        name: newCatName.trim(),
        defaultRate: Number(newCatRate) || 0,
        rateType: 'daily',
      });
      setNewCatName('');
      setShowAddCat(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to add category');
    }
  };

  const filteredTeams = teams.filter((t) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(term) ||
      t.work_category.toLowerCase().includes(term) ||
      (t.location_project || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 animate-slide-in">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-[#456B5A]/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-[#456B5A]" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-[#014025] tracking-tight">
              Teams &amp; Work Categories
            </h1>
          </div>
          <p className="text-xs text-[#696969] mt-1.5 ml-10">
            Operational identities, reusable role configurations, and rate templates
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAddCat(!showAddCat)}
            className="flex items-center space-x-1.5 px-3 py-2 border border-gray-200 text-[#014025] hover:bg-[#456B5A]/5 hover:border-[#456B5A]/30 rounded-lg text-xs font-medium transition-colors"
          >
            <Tag className="w-3.5 h-3.5 text-[#456B5A]" />
            <span>Add Labour Category</span>
          </button>

          <button
            onClick={handleCreateNewTeam}
            className="group flex items-center space-x-1.5 px-4 py-2 bg-[#014025] hover:bg-[#013520] text-white rounded-lg text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
          >
            <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
            <span>Create Team Template</span>
          </button>
        </div>
      </div>

      {/* Inline Category Creation Drawer */}
      {showAddCat && (
        <form
          onSubmit={handleAddCategory}
          className="bg-[#456B5A]/5 border border-[#456B5A]/20 p-4 rounded-xl space-y-3 animate-slide-in"
        >
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-md bg-[#456B5A]/15 flex items-center justify-center">
              <Tag className="w-3.5 h-3.5 text-[#456B5A]" />
            </div>
            <div className="font-bold text-xs text-[#014025]">Add New Labour Category</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              required
              placeholder="Category Name (e.g. Scaffolder, Welder)"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-800 min-w-56 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#456B5A]/20 focus:border-[#456B5A] hover:border-gray-300"
            />
            <div className="flex items-center space-x-1.5">
              <span className="text-xs text-[#696969]">Default Rate: ₹</span>
              <input
                type="number"
                min="0"
                value={newCatRate}
                onChange={(e) => setNewCatRate(e.target.value)}
                className="w-24 border border-gray-200 rounded-lg px-2 py-2 text-xs font-mono font-bold bg-white text-gray-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#456B5A]/20 focus:border-[#456B5A] hover:border-gray-300"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#014025] hover:bg-[#013520] text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              Save Category
            </button>
            <button
              type="button"
              onClick={() => setShowAddCat(false)}
              className="text-xs text-[#696969] hover:text-[#014025] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Snapshot Preservation Notice */}
      <div className="bg-[#456B5A]/5 border border-[#456B5A]/15 rounded-xl p-4 text-xs text-[#696969] flex items-start space-x-2.5 animate-slide-in" style={{ animationDelay: '0.1s' }}>
        <div className="w-7 h-7 rounded-lg bg-[#456B5A]/15 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-4 h-4 text-[#456B5A]" />
        </div>
        <div className="leading-relaxed">
          <span className="font-bold text-[#014025]">Historical Snapshot Policy:</span> Updating default rates or categories in this template will apply to future weekly assignments. It will <strong className="text-[#014025]">never retroactively alter</strong> previously saved attendance records or past weekly summaries.
        </div>
      </div>

      {/* Search */}
      <div className="max-w-md animate-slide-in" style={{ animationDelay: '0.15s' }}>
        <div className="relative group">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none transition-colors duration-200 group-focus-within:text-[#456B5A]" />
          <input
            type="text"
            placeholder="Search teams by name, category, project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50/50 text-gray-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#456B5A]/20 focus:border-[#456B5A] focus:bg-white hover:border-gray-300"
          />
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex flex-col items-center justify-center space-y-3 shadow-sm">
          <div className="w-8 h-8 border-2 border-[#456B5A]/20 border-t-[#456B5A] rounded-full animate-spin" />
          <p className="text-xs text-[#696969]">Loading team templates...</p>
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm animate-slide-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#456B5A]/10 mb-3">
            <Users className="w-6 h-6 text-[#456B5A]" />
          </div>
          <p className="text-sm font-semibold text-[#014025]">
            {search ? 'No teams match your search' : 'No team templates yet'}
          </p>
          <p className="text-xs text-[#696969] mt-1">
            {search ? 'Try a different name, category, or project.' : 'Create your first team template to get started.'}
          </p>
          {!search && (
            <button
              onClick={handleCreateNewTeam}
              className="mt-4 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#456B5A]/10 hover:bg-[#456B5A]/20 text-[#014025] rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Team Template</span>
            </button>
          )}
        </div>
      ) : (
        /* Teams Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeams.map((team, idx) => (
            <div
              key={team.id}
              className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:border-[#456B5A]/30 hover:shadow-md transition-all duration-200 flex flex-col justify-between animate-slide-in"
              style={{ animationDelay: `${0.2 + 0.04 * idx}s` }}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-[#014025]">{team.name}</h3>
                    <span className="inline-block text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-[#456B5A]/10 text-[#014025] mt-1">
                      {team.work_category}
                    </span>
                  </div>
                  <button
                    onClick={() => handleEditTeam(team)}
                    className="p-1.5 text-gray-300 hover:text-[#014025] hover:bg-[#014025]/10 rounded-md transition-colors duration-150"
                    title="Edit team template"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                {team.location_project && (
                  <div className="text-xs text-[#696969] mt-2">
                    <span className="font-semibold text-[#014025]">Project / Site:</span>{' '}
                    {team.location_project}
                  </div>
                )}

                {team.notes && (
                  <div className="text-xs text-[#696969] italic mt-1">{team.notes}</div>
                )}

                {/* Roles & Default Rates */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-[11px] font-semibold text-[#696969] mb-1.5">
                    Default Labour Roles &amp; Rates:
                  </div>
                  {team.roles && team.roles.length > 0 ? (
                    <div className="space-y-1">
                      {team.roles.map((r: any, rIdx: number) => (
                        <div key={rIdx} className="flex justify-between text-xs font-mono">
                          <span className="text-[#696969] font-sans">{r.category_name}:</span>
                          <span className="font-bold text-[#014025]">{formatINR(r.default_rate)}/day</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#696969]/70">No default roles configured.</div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-[#696969]">
                <span className="capitalize px-1.5 py-0.5 rounded-md bg-[#696969]/10">{team.status}</span>
                <button
                  onClick={() => handleEditTeam(team)}
                  className="flex items-center space-x-1 text-[#456B5A] font-semibold hover:text-[#014025] transition-colors"
                >
                  <span>Configure Template</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TeamModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={loadData}
        editTeam={editingTeam}
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
        .animate-fade-in {
          animation: fade-in 0.5s ease forwards;
        }
        .animate-slide-in {
          opacity: 0;
          animation: slide-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}