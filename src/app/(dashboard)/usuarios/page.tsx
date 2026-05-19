'use client';

import { useState, useMemo } from 'react';
import { useUsers } from '@/hooks/useUsers';
import { usePayments } from '@/hooks/usePayments';
import { UserCard } from '@/components/UserCard';

type Filter = 'all' | 'subscribed' | 'not_subscribed';

const formatCOP = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);

export default function UsuariosPage() {
  const { users, loading, error } = useUsers();
  const { payments, loading: loadingPayments } = usePayments();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const subscriptionByPhone = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of payments) {
      if (p.type === 'subscription' && p.status === 'APPROVED') {
        if (!map[p.userPhone] || p.amount > map[p.userPhone]) {
          map[p.userPhone] = p.amount;
        }
      }
    }
    return map;
  }, [payments]);

  const subscribedCount = useMemo(() => users.filter(u => u.isSubscribed).length, [users]);
  const notSubscribedCount = useMemo(() => users.filter(u => !u.isSubscribed).length, [users]);
  const totalSubscriptionRevenue = useMemo(() =>
    Object.values(subscriptionByPhone).reduce((sum, v) => sum + v, 0),
  [subscriptionByPhone]);

  const filtered = useMemo(() => {
    let list = users;
    if (filter === 'subscribed') list = list.filter(u => u.isSubscribed);
    if (filter === 'not_subscribed') list = list.filter(u => !u.isSubscribed);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      u =>
        u.name?.toLowerCase().includes(q) ||
        u.lastName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.phone?.includes(q)
    );
  }, [users, search, filter]);

  const isLoading = loading || loadingPayments;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-slate-900 text-2xl font-bold">Usuarios</h1>
        <p className="text-slate-500 text-sm mt-1">{users.length} usuarios registrados</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-slate-400 text-xs">Total usuarios</p>
          <p className="text-slate-900 font-bold text-lg">{users.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-slate-400 text-xs">Suscritos</p>
          <p className="text-blue-600 font-bold text-lg">{subscribedCount}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-slate-400 text-xs">No suscritos</p>
          <p className="text-slate-500 font-bold text-lg">{notSubscribedCount}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-slate-400 text-xs">Ingresos suscripciones</p>
          <p className="text-blue-600 font-bold text-lg">{formatCOP(totalSubscriptionRevenue)}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'all', label: `Todos (${users.length})` },
          { key: 'subscribed', label: `Suscritos (${subscribedCount})` },
          { key: 'not_subscribed', label: `No suscritos (${notSubscribedCount})` },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por nombre, email o teléfono..."
        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors mb-6 shadow-sm"
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="text-red-500 text-center py-8">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400 text-center py-8">No hay usuarios</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(user => (
            <UserCard
              key={user.id}
              user={user}
              subscriptionAmount={user.phone ? subscriptionByPhone[user.phone] : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
