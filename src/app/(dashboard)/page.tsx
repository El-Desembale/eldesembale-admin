'use client';

import { useState, useMemo } from 'react';
import { useLoans } from '@/hooks/useLoans';
import { LoanCard } from '@/components/LoanCard';
import { LoanRequest } from '@/lib/types';

const STATUS_FILTERS: { label: string; value: LoanRequest['status'] | 'all' }[] = [
  { label: 'Todas', value: 'all' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'En proceso', value: 'in_process' },
  { label: 'En desembolso', value: 'in_disbursement_process' },
  { label: 'Aprobadas', value: 'approved' },
  { label: 'Rechazadas', value: 'rejected' },
];

export default function HomePage() {
  const { loans, loading, error, refetch } = useLoans();
  const [filter, setFilter] = useState<LoanRequest['status'] | 'all'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return loans.filter(loan => {
      const matchesStatus = filter === 'all' || loan.status === filter;
      const matchesSearch = !search || loan.phone.includes(search);
      return matchesStatus && matchesSearch;
    });
  }, [loans, filter, search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-bold">Solicitudes</h1>
          <p className="text-gray-400 text-sm mt-1">{loans.length} solicitudes en total</p>
        </div>
        <button
          onClick={refetch}
          className="text-[#2FFF00] border border-[#2FFF00]/30 px-3 py-1.5 rounded-lg text-sm hover:bg-[#2FFF00]/10 transition-colors"
        >
          Actualizar
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por teléfono..."
        className="w-full bg-[#0d1f0d] border border-[#2FFF00]/20 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#2FFF00]/60 transition-colors mb-4"
      />

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap mb-6">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              filter === f.value
                ? 'bg-[#2FFF00] text-black'
                : 'bg-[#2FFF00]/10 text-[#2FFF00] hover:bg-[#2FFF00]/20'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#2FFF00] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="text-red-400 text-center py-8">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No hay solicitudes</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(loan => (
            <LoanCard key={loan.id} loan={loan} />
          ))}
        </div>
      )}
    </div>
  );
}
