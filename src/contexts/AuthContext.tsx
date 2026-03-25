'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setToken, removeToken, getToken, setStoredUser, getStoredUser } from '@/lib/api';

export type UserRole = 'Super Admin' | 'Account Manager' | 'Recruiter';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      const stored = getStoredUser();
      if (stored) setUser(stored);
      api.auth.me()
        .then(({ user }) => { setUser(user); setStoredUser(user); })
        .catch(() => { removeToken(); setUser(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.auth.login(email, password);
    setToken(token);
    setStoredUser(user);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    try { await api.auth.logout(); } catch {}
    removeToken();
    setUser(null);
  }, []);

  const isRole = useCallback((...roles: UserRole[]) => {
    return user ? roles.includes(user.role) : false;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
