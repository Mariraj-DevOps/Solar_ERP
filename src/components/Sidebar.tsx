import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  CalendarCheck2,
  Users,
  FileSpreadsheet,
  CalendarRange,
  ReceiptIndianRupee,
  BadgePercent,
  ShieldCheck,
  History,
  Settings,
  LogOut,
  Menu,
  X,
  Building2,
  CheckCircle2,
  CreditCard,
  Paperclip,
  BookOpen,
  Wallet,
  Bell,
  UserCog,
  FileText,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  ChevronLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export type NavTab =
  | 'dashboard'
  | 'attendance'
  | 'my-reports'
  | 'teams'
  | 'weekly-reports'
  | 'monthly-reports'
  | 'approvals'
  | 'payments'
  | 'attachments'
  | 'charges'
  | 'adjustments'
  | 'staff'
  | 'secondary-admins'
  | 'office-accounts'
  | 'petty-cash'
  | 'notifications'
  | 'audit'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

interface NavItemDef {
  id: NavTab;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  adminOnly?: boolean;
  masterAdminOnly?: boolean;
  staffOnly?: boolean;
}

interface NavCategory {
  id: string;
  name: string;
  items: NavItemDef[];
}

export function Sidebar({ currentTab, onTabChange }: SidebarProps) {
  const { user, logout, isMasterAdmin, isSecondaryAdmin, isAdminAny, isStaff } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Collapsible category state (all open by default)
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;
    const fetchCounters = async () => {
      try {
        const notifRes = await api.notifications.list();
        if (isMounted) setUnreadNotifs(notifRes.unreadCount || 0);

        if (isAdminAny) {
          const queue = await api.attendance.getQueue();
          if (isMounted && Array.isArray(queue)) {
            setPendingApprovals(queue.length);
          }
        }
      } catch {}
    };
    fetchCounters();
    const interval = setInterval(fetchCounters, 25000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAdminAny]);

  const toggleCategory = (catId: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const navCategories: NavCategory[] = [
    {
      id: 'overview',
      name: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
        { id: 'my-reports', label: 'My Workspace', icon: <FileText className="w-4 h-4" /> },
      ],
    },
    {
      id: 'operations',
      name: 'Operations',
      items: [
        { id: 'attendance', label: 'Daily Attendance', icon: <CalendarCheck2 className="w-4 h-4" /> },
        {
          id: 'approvals',
          label: 'Approval Queue',
          icon: <CheckCircle2 className="w-4 h-4" />,
          badge: pendingApprovals,
          adminOnly: true,
        },
        { id: 'weekly-reports', label: 'Weekly Reports', icon: <FileSpreadsheet className="w-4 h-4" /> },
        { id: 'monthly-reports', label: 'Monthly Reports', icon: <CalendarRange className="w-4 h-4" /> },
      ],
    },
    {
      id: 'financials',
      name: 'Financials & Accounts',
      items: [
        { id: 'payments', label: 'Payment Tracker', icon: <CreditCard className="w-4 h-4" /> },
        {
          id: 'petty-cash',
          label: 'Petty Cash Ledger',
          icon: <Wallet className="w-4 h-4" />,
          adminOnly: true,
        },
        {
          id: 'office-accounts',
          label: 'Office Accounts Ledger',
          icon: <BookOpen className="w-4 h-4" />,
          adminOnly: true,
        },
      ],
    },
    {
      id: 'admin',
      name: 'Administration',
      items: [
        { id: 'teams', label: 'Teams & Templates', icon: <Users className="w-4 h-4" /> },
        { id: 'charges', label: 'Additional Charges', icon: <ReceiptIndianRupee className="w-4 h-4" /> },
        { id: 'adjustments', label: 'Advances & Deductions', icon: <BadgePercent className="w-4 h-4" /> },
        { id: 'attachments', label: 'Document Vault', icon: <Paperclip className="w-4 h-4" /> },
      ],
    },
    {
      id: 'system',
      name: 'System & Security',
      items: [
        {
          id: 'staff',
          label: 'Staff Management',
          icon: <ShieldCheck className="w-4 h-4" />,
          adminOnly: true,
        },
        {
          id: 'secondary-admins',
          label: 'Manager Scopes',
          icon: <UserCog className="w-4 h-4" />,
          masterAdminOnly: true,
        },
        {
          id: 'notifications',
          label: 'Notifications',
          icon: <Bell className="w-4 h-4" />,
          badge: unreadNotifs,
        },
        { id: 'audit', label: 'Audit History', icon: <History className="w-4 h-4" /> },
        { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
      ],
    },
  ];

  const handleSelectTab = (tab: NavTab) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  // Mobile Bottom Navigation Bar core 5 items
  const mobileCoreTabs: Array<{ id: NavTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'dashboard', label: 'Home', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'attendance', label: 'Attendance', icon: <CalendarCheck2 className="w-4 h-4" /> },
    ...(isAdminAny
      ? [{ id: 'approvals' as NavTab, label: 'Approvals', icon: <CheckCircle2 className="w-4 h-4" />, badge: pendingApprovals }]
      : [{ id: 'my-reports' as NavTab, label: 'My Report', icon: <FileText className="w-4 h-4" /> }]),
    { id: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4" /> },
  ];

  return (
    <>
      {/* 1. Mobile Top Header Bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0B2E21] border-b border-white/10 text-white sticky top-0 z-30 shadow-xs">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#456B5A]/40 border border-emerald-400/30 flex items-center justify-center text-white">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-xs tracking-tight text-white leading-tight">Labour ERP</div>
            <div className="text-[10px] text-emerald-200/70 font-mono capitalize">
              {user?.role === 'master_admin' ? 'Master Admin' : user?.role === 'secondary_admin' ? 'Manager' : 'Staff'}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleSelectTab('notifications')}
            className="p-1.5 text-white/80 hover:text-white relative rounded-lg hover:bg-white/10"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifs > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-500 rounded-full text-[9px] font-bold flex items-center justify-center text-white ring-1 ring-[#0B2E21]">
                {unreadNotifs}
              </span>
            )}
          </button>

          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10"
            title="Full Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Desktop & Tablet Sidebar (Collapsible & Categorized) */}
      <aside
        className={`hidden md:flex flex-col h-screen sticky top-0 bg-[#0B2E21] border-r border-[#456B5A]/25 text-white/80 transition-all duration-250 ease-in-out shrink-0 select-none z-30 ${
          isCollapsed ? 'w-18' : 'w-64'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-[#456B5A]/20 flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center space-x-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-[#456B5A]/35 border border-emerald-300/25 flex items-center justify-center text-emerald-300 shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs text-white tracking-tight leading-tight truncate">
                  Labour ERP Suite
                </div>
                <div className="text-[10px] text-emerald-200/60 font-mono truncate">Saturday–Friday Cycle</div>
              </div>
            </div>
          )}

          {isCollapsed && (
            <div className="w-full flex justify-center">
              <div className="w-8 h-8 rounded-lg bg-[#456B5A]/35 border border-emerald-300/25 flex items-center justify-center text-emerald-300">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors ${
              isCollapsed ? 'mt-2 w-full flex justify-center' : ''
            }`}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* User Card */}
        {user && !isCollapsed && (
          <div className="px-3 py-2.5 mx-3 my-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#456B5A]/50 border border-emerald-400/30 flex items-center justify-center text-emerald-100 shrink-0 font-bold text-xs">
                {user.fullName?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{user.fullName}</div>
                <div className="text-[10px] text-emerald-300/80 flex items-center space-x-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="capitalize truncate">
                    {user.role === 'master_admin' ? 'Master Admin' : user.role === 'secondary_admin' ? 'Operations Manager' : 'Staff Workspace'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Categorized Navigation List */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-2 space-y-3 no-scrollbar">
          {navCategories.map((category) => {
            // Filter items by role
            const visibleItems = category.items.filter((item) => {
              if (item.masterAdminOnly && !isMasterAdmin) return false;
              if (item.adminOnly && !isAdminAny) return false;
              if (item.staffOnly && !isStaff) return false;
              return true;
            });

            if (visibleItems.length === 0) return null;
            const isCatCollapsed = Boolean(collapsedCategories[category.id]);

            return (
              <div key={category.id} className="space-y-1">
                {/* Category Header */}
                {!isCollapsed && (
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="w-full flex items-center justify-between px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-emerald-200/50 hover:text-emerald-100 transition-colors"
                  >
                    <span>{category.name}</span>
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-200 ${
                        isCatCollapsed ? '-rotate-90' : 'rotate-0'
                      }`}
                    />
                  </button>
                )}

                {/* Category Items */}
                {(!isCatCollapsed || isCollapsed) && (
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const isActive = currentTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSelectTab(item.id)}
                          title={isCollapsed ? item.label : undefined}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-all relative ${
                            isActive
                              ? 'bg-gradient-to-r from-[#456B5A] to-[#3B5E4F] text-white font-semibold shadow-xs'
                              : 'text-white/75 hover:text-white hover:bg-white/8'
                          } ${isCollapsed ? 'justify-center' : ''}`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <span className={isActive ? 'text-white' : 'text-emerald-200/70'}>
                              {item.icon}
                            </span>
                            {!isCollapsed && <span className="truncate">{item.label}</span>}
                          </div>

                          {!isCollapsed && item.badge && item.badge > 0 ? (
                            <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                              {item.badge}
                            </span>
                          ) : null}

                          {isCollapsed && item.badge && item.badge > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer Logout */}
        <div className="p-3 border-t border-[#456B5A]/20">
          <button
            onClick={logout}
            className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors ${
              isCollapsed ? 'justify-center' : ''
            }`}
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* 3. Modern Mobile Slide-Up / Full Drawer Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="relative bg-[#0B2E21] border-t border-[#456B5A]/40 rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden text-white shadow-2xl"
            >
              {/* Drawer Handle & Header */}
              <div className="pt-3 pb-2 px-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="font-bold text-sm text-white">Full Application Menu</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-full bg-white/10 text-white/70 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="overflow-y-auto p-4 space-y-4 no-scrollbar">
                {navCategories.map((cat) => {
                  const visible = cat.items.filter((item) => {
                    if (item.masterAdminOnly && !isMasterAdmin) return false;
                    if (item.adminOnly && !isAdminAny) return false;
                    if (item.staffOnly && !isStaff) return false;
                    return true;
                  });
                  if (visible.length === 0) return null;

                  return (
                    <div key={cat.id} className="space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300/60 px-1">
                        {cat.name}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {visible.map((item) => {
                          const isActive = currentTab === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => handleSelectTab(item.id)}
                              className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-medium border text-left transition-all ${
                                isActive
                                  ? 'bg-[#456B5A] text-white border-emerald-400 font-semibold shadow-xs'
                                  : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                              }`}
                            >
                              <div className="flex items-center space-x-2 truncate">
                                <span className={isActive ? 'text-white' : 'text-emerald-300'}>{item.icon}</span>
                                <span className="truncate">{item.label}</span>
                              </div>
                              {item.badge && item.badge > 0 ? (
                                <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[9px] font-bold shrink-0">
                                  {item.badge}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <div className="pt-2 border-t border-white/10 flex justify-between items-center text-xs">
                  <div className="text-white/60">Signed in as <span className="text-white font-semibold">{user?.fullName}</span></div>
                  <button
                    onClick={logout}
                    className="px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 border border-red-700/50 flex items-center space-x-1.5 font-semibold"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. Modern Mobile Bottom Navigation Bar (iOS / Android App Style) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B2E21]/95 backdrop-blur-md border-t border-[#456B5A]/30 py-1.5 px-3 shadow-lg flex items-center justify-around">
        {mobileCoreTabs.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelectTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all relative ${
                isActive ? 'text-emerald-300 font-bold scale-105' : 'text-white/60 hover:text-white'
              }`}
            >
              <div className="relative">
                {item.icon}
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 -right-2 w-3.5 h-3.5 bg-amber-500 rounded-full text-[8px] font-bold flex items-center justify-center text-white ring-1 ring-[#0B2E21]">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
              {isActive && (
                <motion.div
                  layoutId="activeBottomIndicator"
                  className="w-1.5 h-1 rounded-full bg-emerald-400 mt-0.5"
                />
              )}
            </button>
          );
        })}

        {/* 5th Button: Open Full Menu Sheet */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all text-white/60 hover:text-white`}
        >
          <MoreHorizontal className="w-4 h-4" />
          <span className="text-[10px] mt-0.5 tracking-tight">More</span>
        </button>
      </nav>
    </>
  );
}
