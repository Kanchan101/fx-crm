'use client';

import { useEffect, useState, createContext } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export const SidebarContext = createContext({
  collapsed: false,
  setCollapsed: (v: boolean) => {},
  mobileOpen: false,
  setMobileOpen: (v: boolean) => {},
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading CRM...</p>
        </div>
      </div>
    );
  }
  if (!user) return null;

  const paddingLeft = isDesktop ? (collapsed ? 72 : 260) : 0;

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}>
      <div className="min-h-screen bg-gray-50">
        {mobileOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
        )}
        <Sidebar />
        <div className="transition-all duration-300" style={{ paddingLeft }}>
          <Header />
          <main className="p-4 sm:p-6 page-enter">{children}</main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
