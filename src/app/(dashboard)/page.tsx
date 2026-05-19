'use client';

import { useState, useMemo } from 'react';
import { useLoans } from '@/hooks/useLoans';
import { useUsers } from '@/hooks/useUsers';
import { LoanCard } from '@/components/LoanCard';
import { LoanRequest } from '@/lib/types';
import { isInMora } from '@/lib/mora';

const STATUS_FILTERS: { label: string; value: LoanRequest['status'] | 'all' | 'mora' }[] = [
  { label: 'Todas', value: 'all' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'En proceso', value: 'in_process' },
  { label: 'En desembolso', value: 'in_disbursement_process' },
  { label: 'Aprobadas', value: 'approved' },
  { label: 'Rechazadas', value: 'rejected' },
  { label: '⚠ En mora', value: 'mora' },
];

export default function HomePage() {
  const { loans, loading, error, refetch } = useLoans();
  const { users } = useUsers();
  const [filter, setFilter] = useState<LoanRequest['status'] | 'all' | 'mora'>('all');
  const [search, setSearch] = useState('');

  const usersByPhone = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) {
      if (u.phone) map[u.phone] = [u.name, u.lastName].filter(Boolean).join(' ');
    }
    return map;
  }, [users]);

  const moraCount = useMemo(() => loans.filter(isInMora).length, [loans]);

  const filtered = useMemo(() => {
    return loans.filter(loan => {
      const matchesStatus =
        filter === 'all' ? true :
        filter === 'mora' ? isInMora(loan) :
        loan.status === filter;
      const matchesSearch = !search || loan.phone.includes(search) ||
        (usersByPhone[loan.phone] || '').toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [loans, filter, search, usersByPhone]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-slate-900 text-2xl font-bold">Solicitudes</h1>
          <p className="text-slate-500 text-sm mt-1">
            {loans.length} solicitudes en total
            {moraCount > 0 && (
              <span className="ml-2 text-orange-500 font-medium">· {moraCount} en mora</span>
            )}
          </p>
        </div>
        <button
          onClick={refetch}
          className="text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg text-sm hover:bg-blue-50 transition-colors font-medium"
        >
          Actualizar
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por teléfono o nombre..."
        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors mb-4 shadow-sm"
      />

      <div className="flex gap-2 flex-wrap mb-6">
        {STATUS_FILTERS.map(f => {
          const isMora = f.value === 'mora';
          const isActive = filter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                isActive
                  ? isMora ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'
                  : isMora
                    ? 'bg-orange-50 text-orange-500 hover:bg-orange-100 border border-orange-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
              {isMora && moraCount > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white/20' : 'bg-orange-100'}`}>
                  {moraCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="text-red-500 text-center py-8">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400 text-center py-8">No hay solicitudes</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(loan => (
            <LoanCard
              key={loan.id}
              loan={loan}
              userName={usersByPhone[loan.phone]}
              inMora={isInMora(loan)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
