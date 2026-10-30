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
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [navParams, setNavParams] = useState<any>({});

  const handleNavigate = (tab: NavTab, params?: any) => {
    if (params) setNavParams(params);
    setCurrentTab(tab);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#014025] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-9 h-9 border-3 border-white border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-xs font-semibold text-white/80">Loading Labour Attendance ERP...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
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
        {currentTab === 'audit' && <AuditHistoryPage />}
        {currentTab === 'settings' && <SettingsPage />}
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
