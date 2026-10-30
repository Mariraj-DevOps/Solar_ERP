import React, { useState } from 'react';
import { Building2, ShieldCheck, UserCheck, AlertCircle, Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Company branding — replace these with your actual assets
const COMPANY_NAME = 'Acme Labour ERP';
const COMPANY_LOGO_URL = 'https://placehold.co/120x120/456B5A/FFFFFF?text=Logo';

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
    <div className="min-h-screen bg-white flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#456B5A]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#014025]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#456B5A]/3 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden transition-shadow duration-300 hover:shadow-2xl">
          {/* Header */}
          <div className="bg-gradient-to-br from-[#014025] to-[#456B5A] p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_30%_20%,white_0%,transparent_50%)]" />
            </div>
            <div className="relative">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 mb-4 transition-transform duration-500 hover:scale-105">
                <img
                  src={COMPANY_LOGO_URL}
                  alt={`${COMPANY_NAME} logo`}
                  className="w-14 h-14 object-contain rounded-lg"
                />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{COMPANY_NAME}</h1>
              <p className="text-sm text-white/70 mt-1.5 font-medium">
                Weekly Attendance &amp; Payment System
              </p>
              <div className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/10 text-[11px] text-white/80 border border-white/10">
                <Building2 className="w-3 h-3" />
                <span>Sat – Fri Cycle</span>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start space-x-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="animate-slide-in" style={{ animationDelay: '0.1s' }}>
              <label className="block text-xs font-semibold text-[#696969] mb-1.5">
                Email Address
              </label>
              <div className="relative group">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none transition-colors duration-200 group-focus-within:text-[#456B5A]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.erp"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50/50 text-gray-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#456B5A]/20 focus:border-[#456B5A] focus:bg-white hover:border-gray-300"
                />
              </div>
            </div>

            <div className="animate-slide-in" style={{ animationDelay: '0.2s' }}>
              <label className="block text-xs font-semibold text-[#696969] mb-1.5">
                Password
              </label>
              <div className="relative group">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none transition-colors duration-200 group-focus-within:text-[#456B5A]" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50/50 text-gray-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#456B5A]/20 focus:border-[#456B5A] focus:bg-white hover:border-gray-300"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-[#014025] hover:bg-[#013520] text-white rounded-lg text-sm font-semibold shadow-md flex items-center justify-center space-x-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden animate-slide-in"
              style={{ animationDelay: '0.3s' }}
            >
              <span className="relative z-10">
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
                <ArrowRight className="w-4 h-4 relative z-10 transition-transform duration-200 group-hover:translate-x-1" />
              )}
              <div className="absolute inset-0 bg-[#456B5A] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          </form>

          {/* Role presets */}
          <div className="bg-gray-50/80 p-5 border-t border-gray-100">
            <div className="text-[11px] font-semibold text-[#696969] uppercase tracking-wider mb-3 text-center">
              Role-Based Access Presets
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => fillCredentials('admin')}
                className="p-3 border border-gray-200 bg-white hover:bg-[#456B5A]/5 hover:border-[#456B5A]/30 rounded-xl text-left transition-all duration-200 group hover:shadow-sm"
              >
                <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-800 group-hover:text-[#014025] transition-colors">
                  <ShieldCheck className="w-4 h-4 text-[#014025]" />
                  <span>Admin</span>
                </div>
                <div className="text-[10px] text-[#696969] truncate mt-1">admin@company.erp</div>
                <div className="text-[10px] text-[#456B5A] font-mono mt-0.5">Admin@ERP2026!</div>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials('staff')}
                className="p-3 border border-gray-200 bg-white hover:bg-[#456B5A]/5 hover:border-[#456B5A]/30 rounded-xl text-left transition-all duration-200 group hover:shadow-sm"
              >
                <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-800 group-hover:text-[#014025] transition-colors">
                  <UserCheck className="w-4 h-4 text-[#456B5A]" />
                  <span>Staff</span>
                </div>
                <div className="text-[10px] text-[#696969] truncate mt-1">staff@company.erp</div>
                <div className="text-[10px] text-[#456B5A] font-mono mt-0.5">Staff@ERP2026!</div>
              </button>
            </div>

            <div className="mt-3.5 text-[10px] text-[#696969]/80 text-center leading-relaxed">
              No public registration. Labourers are count-based and have no login.
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-[#696969]/60 mt-6 animate-fade-in" style={{ animationDelay: '0.5s' }}>
          © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
        </p>
      </div>

      {/* Custom animations */}
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-slide-in {
          opacity: 0;
          animation: slide-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          opacity: 0;
          animation: fade-in 0.5s ease forwards;
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}