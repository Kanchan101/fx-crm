'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Search, Bell } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard', '/requirements': 'Requirements', '/candidates': 'Candidates',
  '/clients': 'Clients', '/pipeline': 'Pipeline', '/interviews': 'Interviews',
  '/reports': 'Reports', '/team': 'Team Management',
};

export default function Header() {
  const pathname = usePathname();
  const { user } = useAuth();
  const title = PAGE_TITLES[pathname] || 'FX CRM';
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-30">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <p className="text-xs text-gray-400 -mt-0.5">{greeting()}, {user?.name?.split(' ')[0]}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors cursor-text w-64">
          <Search className="w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search candidates, clients..."
            className="bg-transparent text-sm outline-none flex-1 placeholder:text-gray-300" />
          <kbd className="text-[10px] text-gray-300 bg-white px-1.5 py-0.5 rounded border border-gray-100">⌘K</kbd>
        </div>
        <button className="relative w-9 h-9 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors">
          <Bell className="w-4 h-4 text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
      </div>
    </header>
  );
}
