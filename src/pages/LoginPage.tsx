import React, { useState } from 'react';
import { CalendarDays, ShieldCheck, UserCheck, AlertCircle, Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Company branding
const COMPANY_NAME = 'Solar Designs Pvt Ltd';
const COMPANY_LOGO_URL = '/assets/aistudio/solar_designs_clean_logo_bf464b07.png';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@company.erp');
  const [password, setPassword] = useState('Admin@ERP2026!');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillCredentials = (role: 'admin' | 'staff') => {
    if (role === 'admin') {
      setEmail('admin@company.erp');
      setPassword('Admin@ERP2026!');
    } else {
      setEmail('staff@company.erp');
      setPassword('Staff@ERP2026!');
    }
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EAF1ED] via-[#F2F6F3] to-[#E5EFE8] flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden">
      {/* Decorative ambient sage glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#0E6037]/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[#3B5E4F]/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-white/40 rounded-full blur-2xl" />
      </div>

      <div className="w-full max-w-[430px] relative z-10 animate-fade-in-up">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-900/8 border border-[#D8E4DD] overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-950/10">
          
          {/* Card Header with Mint Sage Background & Fluid Organic Waves */}
          <div className="relative pt-8 pb-7 px-6 text-center bg-gradient-to-b from-[#E7F0EB] via-[#EEF5F1] to-[#FAFCFA] border-b border-[#E1ECE5] overflow-hidden">
            {/* SVG Organic Wave Ribbons in Corners */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 430 200"
              preserveAspectRatio="none"
            >
              {/* Top-left sage wave ribbons */}
              <path
                d="M-20,-10 C40,40 10,120 -20,130 Z"
                fill="#5C8E75"
                opacity="0.22"
              />
              <path
                d="M-30,-20 C60,20 60,95 -10,115 Z"
                fill="#7BA490"
                opacity="0.30"
              />
              <path
                d="M-10,-30 C100,0 80,70 10,85 Z"
                fill="#A6C5B5"
                opacity="0.38"
              />

              {/* Bottom-right sage wave ribbons */}
              <path
                d="M360,210 C340,150 390,110 440,90 L450,210 Z"
                fill="#A6C5B5"
                opacity="0.35"
              />
              <path
                d="M380,210 C360,165 410,125 450,115 L450,210 Z"
                fill="#7BA490"
                opacity="0.28"
              />
              <path
                d="M405,210 C390,175 425,145 450,135 L450,210 Z"
                fill="#5C8E75"
                opacity="0.20"
              />
            </svg>

            <div className="relative z-10 flex flex-col items-center">
              {/* Circular Wave Logo */}
              <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl flex items-center justify-center p-1 transition-transform duration-300 hover:scale-105">
                <img
                  src={COMPANY_LOGO_URL}
                  alt={`${COMPANY_NAME} logo`}
                  className="w-full h-full object-contain filter drop-shadow-xs"
                />
              </div>

              {/* Title & Subtitle */}
              <h1 className="text-2xl sm:text-[25px] font-bold text-slate-800 tracking-tight mt-2.5">
                {COMPANY_NAME}
              </h1>
              <p className="text-sm text-slate-500 font-medium mt-1">
                Weekly Attendance &amp; Payment System
              </p>

              {/* Sat - Fri Cycle Badge */}
              <div className="mt-3.5 inline-flex items-center space-x-1.5 px-3.5 py-1 rounded-full bg-[#E2EEE7] text-[#134E35] border border-[#CFE1D6] text-xs font-semibold shadow-2xs">
                <CalendarDays className="w-3.5 h-3.5 text-[#134E35]" />
                <span>Sat – Fri Cycle</span>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-7 space-y-4.5 bg-white">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start space-x-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Email Address
              </label>
              <div className="relative group">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none transition-colors duration-200 group-focus-within:text-[#0E6037]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@company.erp"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-[#D5E0DA] rounded-xl bg-[#F8FAF9] text-slate-800 placeholder-slate-400 transition-all duration-200 focus:outline-none focus:ring-3 focus:ring-[#0E6037]/15 focus:border-[#0E6037] focus:bg-white hover:border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Password
              </label>
              <div className="relative group">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none transition-colors duration-200 group-focus-within:text-[#0E6037]" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-[#D5E0DA] rounded-xl bg-[#F8FAF9] text-slate-800 placeholder-slate-400 transition-all duration-200 focus:outline-none focus:ring-3 focus:ring-[#0E6037]/15 focus:border-[#0E6037] focus:bg-white hover:border-slate-300"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-[#0E6037] hover:bg-[#0B4D2C] active:bg-[#083C22] text-white rounded-xl text-sm font-semibold shadow-md shadow-[#0E6037]/20 flex items-center justify-center space-x-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer mt-2"
            >
              <span>
                {isSubmitting ? (
                  <span className="flex items-center space-x-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Authenticating...</span>
                  </span>
                ) : (
                  'Sign In to ERP'
                )}
              </span>
              {!isSubmitting && (
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              )}
            </button>
          </form>

          {/* Quick Role Presets for Testing & Demo */}
          <div className="bg-[#F8FAF9] px-7 py-4.5 border-t border-[#E8EFEA]">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5 text-center">
              Quick Role-Based Access
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => fillCredentials('admin')}
                className="p-2.5 border border-[#D5E0DA] bg-white hover:bg-[#EBF3EE] hover:border-[#0E6037]/40 rounded-xl text-left transition-all duration-200 group hover:shadow-xs cursor-pointer"
              >
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 group-hover:text-[#0E6037] transition-colors">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0E6037]" />
                  <span>Admin</span>
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">admin@company.erp</div>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials('staff')}
                className="p-2.5 border border-[#D5E0DA] bg-white hover:bg-[#EBF3EE] hover:border-[#0E6037]/40 rounded-xl text-left transition-all duration-200 group hover:shadow-xs cursor-pointer"
              >
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 group-hover:text-[#0E6037] transition-colors">
                  <UserCheck className="w-3.5 h-3.5 text-[#3B5E4F]" />
                  <span>Staff</span>
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">staff@company.erp</div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-5">
          © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
        </p>
      </div>

      {/* Animation helpers */}
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-4px); }
          40%, 80% { transform: translateX(4px); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-shake {
          animation: shake 0.35s ease-in-out;
        }
      `}</style>
    </div>
  );
}