'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useContext } from 'react';
import { SidebarContext } from '@/app/(dashboard)/layout';
import { Search, Bell, Menu } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard', '/requirements': 'Requirements', '/candidates': 'Candidates',
  '/clients': 'Clients', '/pipeline': 'Pipeline', '/interviews': 'Interviews',
  '/reports': 'Reports', '/team': 'Team Management',
};

export default function Header() {
  const pathname = usePathname();
  const { user } = useAuth();

  let setMobileOpen = (v: boolean) => {};
  try {
    const ctx = useContext(SidebarContext);
    setMobileOpen = ctx.setMobileOpen;
  } catch {}

  const title = PAGE_TITLES[pathname] || PAGE_TITLES['/' + pathname.split('/')[1]] || 'FX CRM';
  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  };

  return (
    <header className="h-14 sm:h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button onClick={() => setMobileOpen(true)}
          className="w-9 h-9 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center lg:hidden">
          <Menu className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h1>
          <p className="text-xs text-gray-400 -mt-0.5 hidden sm:block">{greeting()}, {user?.name?.split(' ')[0]}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Search — hidden on very small screens */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors w-48 md:w-64">
          <Search className="w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search..."
            className="bg-transparent text-sm outline-none flex-1 placeholder:text-gray-300" />
        </div>
        {/* Mobile search icon */}
        <button className="sm:hidden w-9 h-9 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center">
          <Search className="w-4 h-4 text-gray-500" />
        </button>
        <button className="relative w-9 h-9 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center">
          <Bell className="w-4 h-4 text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
      </div>
    </header>
  );
}
