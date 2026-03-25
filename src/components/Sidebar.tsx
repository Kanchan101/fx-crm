'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, Building2, Users, Kanban, Calendar,
  BarChart3, UserCog, LogOut, ChevronLeft, Briefcase,
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

interface NavItem {
  label: string; href: string; icon: React.ElementType; roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Requirements', href: '/requirements', icon: Briefcase },
  { label: 'Candidates', href: '/candidates', icon: Users },
  { label: 'Clients', href: '/clients', icon: Building2 },
  { label: 'Pipeline', href: '/pipeline', icon: Kanban },
  { label: 'Interviews', href: '/interviews', icon: Calendar },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
  { label: 'Team', href: '/team', icon: UserCog, roles: ['Super Admin'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => { await logout(); router.push('/login'); };

  const filteredNav = NAV_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  );

  const initials = user?.name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();

  return (
    <aside className={clsx(
      'fixed left-0 top-0 h-screen bg-fx-950 text-white flex flex-col z-40 transition-all duration-300',
      collapsed ? 'w-[72px]' : 'w-[260px]'
    )}>
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-fx-600 flex items-center justify-center text-xs font-bold tracking-tight">FX</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">FX CRM</p>
              <p className="text-[10px] text-fx-300/50 uppercase tracking-widest">Consulting</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-fx-600 flex items-center justify-center text-xs font-bold mx-auto">FX</div>
        )}
        <button onClick={() => setCollapsed(!collapsed)}
          className={clsx('w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all', collapsed && 'mx-auto mt-2')}>
          <ChevronLeft className={clsx('w-3.5 h-3.5 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto sidebar-scroll">
        {filteredNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group',
                isActive ? 'bg-fx-600 text-white shadow-lg shadow-fx-600/20' : 'text-gray-400 hover:text-white hover:bg-white/5'
              )} title={collapsed ? item.label : undefined}>
              <Icon className={clsx('w-[18px] h-[18px] shrink-0', isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300')} />
              {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/5 p-3">
        <div className={clsx('flex items-center gap-3 px-3 py-2.5 rounded-lg', collapsed && 'justify-center px-0')}>
          <div className="w-8 h-8 rounded-full bg-fx-700 flex items-center justify-center text-xs font-medium shrink-0">{initials}</div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-[11px] text-gray-500 truncate">{user?.role}</p>
            </div>
          )}
        </div>
        <button onClick={handleLogout}
          className={clsx('w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors mt-1', collapsed && 'justify-center')}
          title="Logout">
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
