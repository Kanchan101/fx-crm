#!/bin/bash
# FX CRM — Mobile Responsive Sidebar
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-mobile.sh

set -e
echo "🚀 FX CRM — Mobile Responsive Sidebar"
echo ""

# ========================
# FRONTEND: Dashboard layout with mobile support
# ========================
cat > "src/app/(dashboard)/layout.tsx" << 'ENDOFFILE'
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

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile sidebar on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
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

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}>
      <div className="min-h-screen bg-gray-50">
        {/* Mobile overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
        )}

        <Sidebar />

        <div className={`lg:${collapsed ? 'pl-[72px]' : 'pl-[260px]'} transition-all duration-300`}>
          <Header />
          <main className="p-4 sm:p-6 page-enter">{children}</main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/layout.tsx (mobile support)"

# ========================
# FRONTEND: Sidebar with mobile hamburger
# ========================
cat > src/components/Sidebar.tsx << 'ENDOFFILE'
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useContext } from 'react';
import { SidebarContext } from '@/app/(dashboard)/layout';
import {
  LayoutDashboard, Building2, Users, Kanban, Calendar,
  BarChart3, UserCog, LogOut, ChevronLeft, Briefcase, X,
} from 'lucide-react';
import clsx from 'clsx';

interface NavItem { label: string; href: string; icon: React.ElementType; roles?: string[]; }

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

  let collapsed = false;
  let setCollapsed = (v: boolean) => {};
  let mobileOpen = false;
  let setMobileOpen = (v: boolean) => {};
  try {
    const ctx = useContext(SidebarContext);
    collapsed = ctx.collapsed;
    setCollapsed = ctx.setCollapsed;
    mobileOpen = ctx.mobileOpen;
    setMobileOpen = ctx.setMobileOpen;
  } catch {}

  const handleLogout = async () => { await logout(); router.push('/login'); };

  const handleNav = (href: string) => {
    router.push(href);
    setMobileOpen(false);
  };

  const filteredNav = NAV_ITEMS.filter(item => !item.roles || (user && item.roles.includes(user.role)));
  const initials = user?.name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={clsx(
        'fixed left-0 top-0 h-screen bg-fx-950 text-white flex-col z-40 transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-[260px]',
        'hidden lg:flex'
      )}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-fx-600 flex items-center justify-center text-xs font-bold">FX</div>
              <div className="leading-tight"><p className="text-sm font-semibold">FX CRM</p><p className="text-[10px] text-fx-300/50 uppercase tracking-widest">Consulting</p></div>
            </div>
          )}
          {collapsed && <div className="w-8 h-8 rounded-lg bg-fx-600 flex items-center justify-center text-xs font-bold mx-auto">FX</div>}
          <button onClick={() => setCollapsed(!collapsed)}
            className={clsx('w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center', collapsed && 'mx-auto mt-2')}>
            <ChevronLeft className={clsx('w-3.5 h-3.5 transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto sidebar-scroll">
          {filteredNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <button key={item.href} onClick={() => handleNav(item.href)}
                className={clsx('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group',
                  isActive ? 'bg-fx-600 text-white shadow-lg shadow-fx-600/20' : 'text-gray-400 hover:text-white hover:bg-white/5')}
                title={collapsed ? item.label : undefined}>
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
            className={clsx('w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors mt-1', collapsed && 'justify-center')}>
            <LogOut className="w-[18px] h-[18px] shrink-0" />{!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <aside className={clsx(
        'fixed left-0 top-0 h-screen w-[280px] bg-fx-950 text-white flex flex-col z-50 transition-transform duration-300 lg:hidden',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-fx-600 flex items-center justify-center text-xs font-bold">FX</div>
            <div className="leading-tight"><p className="text-sm font-semibold">FX CRM</p><p className="text-[10px] text-fx-300/50 uppercase tracking-widest">Consulting</p></div>
          </div>
          <button onClick={() => setMobileOpen(false)}
            className="w-8 h-8 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto sidebar-scroll">
          {filteredNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <button key={item.href} onClick={() => handleNav(item.href)}
                className={clsx('w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all',
                  isActive ? 'bg-fx-600 text-white shadow-lg shadow-fx-600/20' : 'text-gray-400 hover:text-white hover:bg-white/5')}>
                <Icon className={clsx('w-[18px] h-[18px] shrink-0', isActive ? 'text-white' : 'text-gray-500')} />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/5 p-3">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-fx-700 flex items-center justify-center text-xs font-medium shrink-0">{initials}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-[11px] text-gray-500 truncate">{user?.role}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors mt-1">
            <LogOut className="w-[18px] h-[18px] shrink-0" /><span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
ENDOFFILE
echo "✅ src/components/Sidebar.tsx (desktop + mobile)"

# ========================
# FRONTEND: Header with hamburger menu
# ========================
cat > src/components/Header.tsx << 'ENDOFFILE'
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
ENDOFFILE
echo "✅ src/components/Header.tsx (with hamburger)"

# ========================
# FRONTEND: Add responsive CSS
# ========================
cat >> src/app/globals.css << 'ENDOFFILE'

/* Mobile responsive overrides */
@media (max-width: 1023px) {
  .pl-\[260px\], .pl-\[72px\] {
    padding-left: 0 !important;
  }
}

/* Kanban horizontal scroll on mobile */
@media (max-width: 640px) {
  .overflow-x-auto {
    -webkit-overflow-scrolling: touch;
  }
}

/* Touch-friendly targets on mobile */
@media (max-width: 640px) {
  button, a, select {
    min-height: 36px;
  }
}
ENDOFFILE
echo "✅ src/app/globals.css (responsive additions)"

echo ""
echo "=========================================="
echo "🎉 Mobile responsive update complete!"
echo "=========================================="
echo ""
echo "Changes:"
echo "  ✓ Hamburger menu icon in header (visible on mobile/tablet)"
echo "  ✓ Mobile sidebar slides in from left with overlay backdrop"
echo "  ✓ Sidebar auto-closes on navigation + Escape key"
echo "  ✓ Body scroll locked when mobile sidebar is open"
echo "  ✓ Content area takes full width on mobile (no left padding)"
echo "  ✓ Header compact on mobile, search icon replaces search bar"
echo "  ✓ Touch-friendly tap targets on small screens"
echo "  ✓ Desktop sidebar collapse still works as before"
echo ""
echo "No backend restart needed. Deploy:"
echo "  git add . && git commit -m 'Mobile responsive sidebar' && git push"
echo ""
