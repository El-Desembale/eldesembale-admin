'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useUsers } from '@/hooks/useUsers';
import { usePayments } from '@/hooks/usePayments';
import { useLoans } from '@/hooks/useLoans';
import { deleteUser } from '@/lib/firestore';

type Filter = 'all' | 'subscribed' | 'not_subscribed' | 'admins';
type SortOption = 'recent' | 'name' | 'subscriptions' | 'loans';

const formatCOP = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);

function SummaryCard({
  label,
  value,
  accent,
  helper,
}: {
  label: string;
  value: string | number;
  accent: string;
  helper: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
      <div className={`mb-4 h-1.5 w-14 rounded-full ${accent}`} />
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="text-3xl font-semibold tracking-[-0.04em] text-slate-900 xl:text-4xl">
          {value}
        </p>
        <p className="max-w-[9rem] text-right text-xs leading-5 text-slate-400">
          {helper}
        </p>
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  const { users, loading, error, refetch } = useUsers();
  const { payments, loading: loadingPayments } = usePayments();
  const { loans, loading: loadingLoans } = useLoans();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteUser = async (e: React.MouseEvent, userId: string, userPhone: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('¿Eliminar este usuario y todos sus datos (solicitudes, pagos, documentos)? Esta acción no se puede deshacer.')) return;
    setDeletingId(userId);
    try {
      await deleteUser(userId, userPhone);
      refetch();
    } finally {
      setDeletingId(null);
    }
  };

  const subscriptionByPhone = useMemo(() => {
    const latest: Record<string, { amount: number; date: Date }> = {};
    for (const payment of payments) {
      if (payment.type === 'subscription' && payment.status === 'APPROVED') {
        const prev = latest[payment.userPhone];
        if (!prev || payment.createdAt > prev.date) {
          latest[payment.userPhone] = { amount: payment.amount, date: payment.createdAt };
        }
      }
    }
    const map: Record<string, number> = {};
    for (const [phone, entry] of Object.entries(latest)) {
      map[phone] = entry.amount;
    }
    return map;
  }, [payments]);

  const loanCountByPhone = useMemo(() => {
    const map: Record<string, number> = {};
    for (const loan of loans) {
      map[loan.phone] = (map[loan.phone] || 0) + 1;
    }
    return map;
  }, [loans]);

  const activeLoanCountByPhone = useMemo(() => {
    const map: Record<string, number> = {};
    for (const loan of loans) {
      if (loan.status === 'approved') {
        map[loan.phone] = (map[loan.phone] || 0) + 1;
      }
    }
    return map;
  }, [loans]);

  const subscribedCount = useMemo(() => users.filter((user) => user.isSubscribed).length, [users]);
  const notSubscribedCount = useMemo(() => users.filter((user) => !user.isSubscribed).length, [users]);
  const adminCount = useMemo(() => users.filter((user) => user.admin).length, [users]);
  const totalSubscriptionRevenue = useMemo(
    () => Object.values(subscriptionByPhone).reduce((sum, value) => sum + value, 0),
    [subscriptionByPhone],
  );

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    let list = users;

    if (filter === 'subscribed') list = list.filter((user) => user.isSubscribed);
    if (filter === 'not_subscribed') list = list.filter((user) => !user.isSubscribed);
    if (filter === 'admins') list = list.filter((user) => user.admin);

    if (normalizedSearch) {
      list = list.filter((user) =>
        [user.name, user.lastName, user.email, user.phone]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch),
      );
    }

    const next = [...list];
    next.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return `${a.name} ${a.lastName}`.localeCompare(`${b.name} ${b.lastName}`, 'es');
        case 'subscriptions':
          return (subscriptionByPhone[b.phone] || 0) - (subscriptionByPhone[a.phone] || 0);
        case 'loans':
          return (loanCountByPhone[b.phone] || 0) - (loanCountByPhone[a.phone] || 0);
        case 'recent':
        default:
          return b.id.localeCompare(a.id);
      }
    });

    return next;
  }, [filter, loanCountByPhone, search, sortBy, subscriptionByPhone, users]);

  const isLoading = loading || loadingPayments || loadingLoans;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Panel de usuarios
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-900 md:text-4xl">
              Usuarios ordenados para revisar actividad y acceso
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
              Consulta suscripciones, volumen de solicitudes y accesos administrativos desde una
              sola tabla operativa.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
            {filtered.length} de {users.length} usuarios
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total"
          value={users.length}
          accent="bg-slate-400"
          helper="Todos los usuarios registrados"
        />
        <SummaryCard
          label="Suscritos"
          value={subscribedCount}
          accent="bg-blue-400"
          helper="Con acceso activo a la plataforma"
        />
        <SummaryCard
          label="No suscritos"
          value={notSubscribedCount}
          accent="bg-slate-400"
          helper="Usuarios sin activacion de suscripcion"
        />
        <SummaryCard
          label="Ingresos"
          value={formatCOP(totalSubscriptionRevenue)}
          accent="bg-amber-400"
          helper="Total aprobado en pagos de suscripcion"
        />
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'Todos', count: users.length },
              { key: 'subscribed', label: 'Suscritos', count: subscribedCount },
              { key: 'not_subscribed', label: 'No suscritos', count: notSubscribedCount },
              { key: 'admins', label: 'Admins', count: adminCount },
            ].map((tab) => {
              const active = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key as Filter)}
                  className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${active ? 'bg-white/20' : 'bg-white'} `}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_220px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, correo o telefono..."
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-400"
            />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400"
            >
              <option value="recent">Mas reciente</option>
              <option value="name">Nombre A-Z</option>
              <option value="subscriptions">Mayor suscripcion</option>
              <option value="loans">Mas solicitudes</option>
            </select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="px-6 py-16 text-center text-sm text-rose-600">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-400">
            No hay usuarios para los filtros actuales.
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(165px,1.1fr)_minmax(170px,1fr)_minmax(120px,0.8fr)_minmax(105px,0.75fr)_minmax(95px,0.58fr)_88px] items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid">
              <div>Usuario</div>
              <div>Contacto</div>
              <div>Suscripcion</div>
              <div>Solicitudes</div>
              <div>Acceso</div>
              <div className="text-right">Accion</div>
            </div>

            <div className="divide-y divide-slate-200">
              {filtered.map((user) => {
                const fullName =
                  [user.name, user.lastName].filter(Boolean).join(' ').trim() || 'Sin nombre';
                const initials = (user.name?.[0] || user.email?.[0] || '?').toUpperCase();
                const subscriptionAmount = user.phone ? subscriptionByPhone[user.phone] : undefined;
                const loanCount = user.phone ? loanCountByPhone[user.phone] || 0 : 0;
                const activeLoanCount = user.phone ? activeLoanCountByPhone[user.phone] || 0 : 0;

                return (
                  <Link
                    key={user.id}
                    href={`/usuarios/${user.id}`}
                    className="block transition hover:bg-slate-50"
                  >
                    <div className="px-5 py-4">
                      <div className="grid gap-3 lg:grid-cols-[minmax(165px,1.1fr)_minmax(170px,1fr)_minmax(120px,0.8fr)_minmax(105px,0.75fr)_minmax(95px,0.58fr)_88px] lg:items-center">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[12px] font-semibold text-blue-700">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-slate-900">
                              {fullName}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">{user.id.slice(0, 8)}</p>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-[13px] text-slate-700">
                            {user.email || 'Sin correo'}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-slate-400">
                            {user.phone || 'Sin telefono'}
                          </p>
                        </div>

                        <div className="min-w-0">
                          {user.isSubscribed ? (
                            <>
                              <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
                                Suscrito
                              </span>
                              {subscriptionAmount && subscriptionAmount > 0 ? (
                                <p className="mt-1.5 truncate text-[13px] font-medium text-slate-900">
                                  {formatCOP(subscriptionAmount)}
                                </p>
                              ) : (
                                <p className="mt-1.5 truncate text-[11px] text-slate-400">
                                  Sin pago registrado
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                              No suscrito
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-slate-900">{loanCount}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{activeLoanCount} activas</p>
                        </div>

                        <div className="min-w-0">
                          {user.admin ? (
                            <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200">
                              Admin
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                              Cliente
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 transition hover:border-blue-300 hover:bg-slate-50">
                            Ver
                          </span>
                          <button
                            onClick={(e) => handleDeleteUser(e, user.id, user.phone)}
                            disabled={deletingId === user.id}
                            className="inline-flex items-center rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[12px] font-medium text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
                            title="Eliminar usuario"
                          >
                            {deletingId === user.id ? '...' : '✕'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
