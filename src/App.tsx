import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar, NavTab } from './components/Sidebar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DailyAttendancePage } from './pages/DailyAttendancePage';
import { MyReportsPage } from './pages/MyReportsPage';
import { TeamsPage } from './pages/TeamsPage';
import { WeeklyReportsPage } from './pages/WeeklyReportsPage';
import { MonthlyReportsPage } from './pages/MonthlyReportsPage';
import { ApprovalQueuePage } from './pages/ApprovalQueuePage';
import { PaymentTrackerPage } from './pages/PaymentTrackerPage';
import { AttachmentsPage } from './pages/AttachmentsPage';
import { AdditionalChargesPage } from './pages/AdditionalChargesPage';
import { AdvancesDeductionsPage } from './pages/AdvancesDeductionsPage';
import { StaffManagementPage } from './pages/StaffManagementPage';
import { SecondaryAdminPage } from './pages/SecondaryAdminPage';
import { OfficeAccountsPage } from './pages/OfficeAccountsPage';
import { PettyCashPage } from './pages/PettyCashPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AuditHistoryPage } from './pages/AuditHistoryPage';
import { SettingsPage } from './pages/SettingsPage';

function ERPContent() {
  const { user, isLoading, isAdminAny } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [navParams, setNavParams] = useState<any>({});

  const handleNavigate = (tab: NavTab, params?: any) => {
    if (params) setNavParams(params);
    setCurrentTab(tab);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#082419] via-[#0E3D28] to-[#0A2E1F] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-18 h-18 rounded-2xl bg-white/95 p-2 shadow-2xl mx-auto border border-emerald-400/20">
            <img
              src="/assets/aistudio/solar_designs_clean_logo_bf464b07.png"
              alt="Solar Design Pvt Ltd"
              className="w-full h-full object-contain animate-pulse"
            />
          </div>
          <div className="space-y-2">
            <div className="w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="text-xs font-semibold text-emerald-100 tracking-wide">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#F0F4F2] flex flex-col md:flex-row">
      <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

      <main className="flex-1 min-w-0 p-3 sm:p-6 lg:p-8 pb-24 md:pb-12">
        {currentTab === 'dashboard' && <DashboardPage onNavigate={handleNavigate} />}
        {currentTab === 'attendance' && <DailyAttendancePage />}
        {currentTab === 'my-reports' && <MyReportsPage />}
        {currentTab === 'teams' && <TeamsPage />}
        {currentTab === 'weekly-reports' && <WeeklyReportsPage />}
        {currentTab === 'monthly-reports' && <MonthlyReportsPage />}
        {currentTab === 'approvals' && <ApprovalQueuePage />}
        {currentTab === 'payments' && <PaymentTrackerPage />}
        {currentTab === 'attachments' && <AttachmentsPage />}
        {currentTab === 'charges' && <AdditionalChargesPage />}
        {currentTab === 'adjustments' && <AdvancesDeductionsPage />}
        {currentTab === 'office-accounts' && <OfficeAccountsPage />}
        {currentTab === 'petty-cash' && <PettyCashPage />}
        {currentTab === 'staff' && <StaffManagementPage />}
        {currentTab === 'secondary-admins' && <SecondaryAdminPage />}
        {currentTab === 'notifications' && <NotificationsPage />}
        {currentTab === 'audit' && (isAdminAny ? <AuditHistoryPage /> : <DashboardPage onNavigate={handleNavigate} />)}
        {currentTab === 'settings' && (isAdminAny ? <SettingsPage /> : <DashboardPage onNavigate={handleNavigate} />)}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ERPContent />
    </AuthProvider>
  );
}
