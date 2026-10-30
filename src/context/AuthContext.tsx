import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getStoredToken, setStoredToken } from '../lib/api';

export type UserRole = 'master_admin' | 'secondary_admin' | 'staff' | 'admin';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  designation?: string;
  assignedLocation?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isMasterAdmin: boolean;
  isSecondaryAdmin: boolean;
  isAdminAny: boolean;
  isStaff: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    const currentToken = getStoredToken();
    if (!currentToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await api.auth.me();
      setUser(res.user);
    } catch {
      setUser(null);
      setStoredToken(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();

    const handleAuthExpired = () => {
      setUser(null);
      setToken(null);
    };

    window.addEventListener('erp:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('erp:auth-expired', handleAuthExpired);
  }, []);

  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.login({ email, password: pass });
      setStoredToken(res.token);
      setToken(res.token);
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
  };

  const isMasterAdmin = Boolean(user && (user.role === 'master_admin' || user.role === 'admin'));
  const isSecondaryAdmin = Boolean(user && user.role === 'secondary_admin');
  const isAdminAny = isMasterAdmin || isSecondaryAdmin;
  const isStaff = Boolean(user && user.role === 'staff');

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isMasterAdmin,
        isSecondaryAdmin,
        isAdminAny,
        isStaff,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
