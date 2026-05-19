'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const NAV = [
  { href: '/', label: 'Solicitudes', icon: '📋' },
  { href: '/usuarios', label: 'Usuarios', icon: '👥' },
  { href: '/pagos', label: 'Pagos', icon: '💰' },
  { href: '/configuracion', label: 'Configuración', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavLinks = () => (
    <nav className="flex flex-col gap-1 flex-1">
      {NAV.map(item => {
        const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
              active
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 bg-white border border-slate-200 p-2 rounded-lg text-slate-600 shadow-sm"
        onClick={() => setMobileOpen(v => !v)}
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 flex flex-col z-40 transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-slate-900 font-bold text-xl">El Desembale</h1>
          <p className="text-slate-400 text-xs mt-1">Admin Panel</p>
        </div>

        <div className="flex-1 p-3 flex flex-col">
          <NavLinks />

          <button
            onClick={logout}
            className="mt-4 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <span>🚪</span>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}
