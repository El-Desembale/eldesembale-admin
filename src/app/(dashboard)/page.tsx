'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLoans } from '@/hooks/useLoans';
import { useUsers } from '@/hooks/useUsers';
import { isInMora } from '@/lib/mora';
import { LoanRequest, STATUS_LABELS } from '@/lib/types';

const STATUS_FILTERS: { label: string; value: LoanRequest['status'] | 'all' | 'mora' }[] = [
  { label: 'Todas', value: 'all' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'En revision', value: 'in_process' },
  { label: 'En desembolso', value: 'in_disbursement_process' },
  { label: 'Aprobadas', value: 'approved' },
  { label: 'Rechazadas', value: 'rejected' },
  { label: 'En mora', value: 'mora' },
];

type SortOption = 'recent' | 'oldest' | 'highest' | 'lowest';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(date: Date) {
  return date.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatShortRequestId(id: string) {
  return id.length > 10 ? `${id.slice(0, 8)}...` : id;
}

function getStatusTone(status: LoanRequest['status'] | 'mora') {
  switch (status) {
    case 'approved':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
    case 'pending':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
    case 'in_process':
      return 'bg-sky-50 text-sky-700 ring-1 ring-sky-200';
    case 'in_disbursement_process':
      return 'bg-violet-50 text-violet-700 ring-1 ring-violet-200';
    case 'rejected':
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
    case 'mora':
      return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200';
    default:
      return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200';
  }
}

function StatusPill({
  status,
  inMora,
}: {
  status: LoanRequest['status'];
  inMora?: boolean;
}) {
  if (inMora) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusTone(
          'mora',
        )}`}
      >
        En mora
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusTone(
        status,
      )}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  helper,
}: {
  label: string;
  value: number;
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
        <p className="text-4xl font-semibold tracking-[-0.04em] text-slate-900">
          {value}
        </p>
        <p className="max-w-[9rem] text-right text-xs leading-5 text-slate-400">
          {helper}
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { loans, loading, error, refetch } = useLoans();
  const { users } = useUsers();
  const [filter, setFilter] = useState<LoanRequest['status'] | 'all' | 'mora'>('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  const usersByPhone = useMemo(() => {
    const map: Record<string, { name: string; email: string }> = {};

    for (const user of users) {
      if (!user.phone) continue;
      map[user.phone] = {
        name: [user.name, user.lastName].filter(Boolean).join(' ').trim(),
        email: user.email,
      };
    }

    return map;
  }, [users]);

  const summary = useMemo(() => {
    const pending = loans.filter((loan) => loan.status === 'pending').length;
    const inReview = loans.filter((loan) => loan.status === 'in_process').length;
    const approved = loans.filter((loan) => loan.status === 'approved').length;
    const overdue = loans.filter(isInMora).length;

    return {
      total: loans.length,
      pending,
      inReview,
      approved,
      overdue,
    };
  }, [loans]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

    const next = loans.filter((loan) => {
      const inOverdue = isInMora(loan);
      const userInfo = usersByPhone[loan.phone];
      const haystack = [loan.phone, loan.id, userInfo?.name || '', userInfo?.email || '']
        .join(' ')
        .toLowerCase();

      const matchesStatus =
        filter === 'all' ? true : filter === 'mora' ? inOverdue : loan.status === filter;

      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      const matchesFrom = !from || loan.createdAt >= from;
      const matchesTo = !to || loan.createdAt <= to;

      return matchesStatus && matchesSearch && matchesFrom && matchesTo;
    });

    next.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return a.createdAt.getTime() - b.createdAt.getTime();
        case 'highest':
          return b.amount - a.amount;
        case 'lowest':
          return a.amount - b.amount;
        case 'recent':
        default:
          return b.createdAt.getTime() - a.createdAt.getTime();
      }
    });

    return next;
  }, [filter, fromDate, loans, search, sortBy, toDate, usersByPhone]);

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Panel de solicitudes
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-900 md:text-4xl">
              Solicitudes de prestamo ordenadas para decidir mas rapido
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
              Revisa el volumen total, filtra por estado o fecha y entra al detalle de cada
              solicitud desde una sola tabla operativa.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={refetch}
              className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-slate-50"
            >
              Actualizar
            </button>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              {filtered.length} de {loans.length} solicitudes
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Total"
          value={summary.total}
          accent="bg-slate-400"
          helper="Todos los registros cargados en el panel"
        />
        <SummaryCard
          label="Pendientes"
          value={summary.pending}
          accent="bg-amber-400"
          helper="Esperando revision inicial"
        />
        <SummaryCard
          label="En revision"
          value={summary.inReview}
          accent="bg-sky-400"
          helper="Casos con validacion en curso"
        />
        <SummaryCard
          label="Aprobadas"
          value={summary.approved}
          accent="bg-emerald-400"
          helper="Solicitudes listas o ya activadas"
        />
        <SummaryCard
          label="En mora"
          value={summary.overdue}
          accent="bg-orange-400"
          helper="Creditos activos con atraso detectado"
        />
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((item) => {
              const active = filter === item.value;
              const isMora = item.value === 'mora';

              return (
                <button
                  key={item.value}
                  onClick={() => setFilter(item.value)}
                  className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                    active
                      ? isMora
                        ? 'bg-orange-500 text-white'
                        : 'bg-blue-600 text-white'
                      : isMora
                        ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {item.label}
                  {isMora && summary.overdue > 0 && (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${
                        active ? 'bg-white/20' : 'bg-orange-100'
                      }`}
                    >
                      {summary.overdue}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_180px_180px_180px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por codigo, telefono, nombre o correo..."
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-400"
            />

            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400"
            />

            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400"
            />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400"
            >
              <option value="recent">Mas reciente</option>
              <option value="oldest">Mas antigua</option>
              <option value="highest">Monto mas alto</option>
              <option value="lowest">Monto mas bajo</option>
            </select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="px-6 py-16 text-center text-sm text-rose-600">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-400">
            No hay solicitudes para los filtros actuales.
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(150px,1.15fr)_minmax(130px,0.9fr)_minmax(150px,1fr)_minmax(105px,0.72fr)_minmax(120px,0.82fr)_minmax(110px,0.76fr)_88px] items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid">
              <div>Solicitud</div>
              <div>Cliente</div>
              <div>Contacto y fecha</div>
              <div>Monto</div>
              <div>Cuotas</div>
              <div>Estado</div>
              <div className="text-right">Accion</div>
            </div>

            <div className="divide-y divide-slate-200">
              {filtered.map((loan) => {
                const userInfo = usersByPhone[loan.phone];
                const fullName = userInfo?.name || 'Sin nombre';
                const email = userInfo?.email || 'Sin correo';
                const inMora = isInMora(loan);
                const paidRatio = `${loan.installmentsPaid}/${loan.installments}`;
                const progress =
                  loan.installments > 0
                    ? Math.min(100, (loan.installmentsPaid / loan.installments) * 100)
                    : 0;

                return (
                  <Link
                    key={loan.id}
                    href={`/solicitudes/${loan.id}`}
                    className="block transition hover:bg-slate-50"
                  >
                    <div className="px-5 py-4">
                      <div className="grid gap-3 lg:grid-cols-[minmax(150px,1.15fr)_minmax(130px,0.9fr)_minmax(150px,1fr)_minmax(105px,0.72fr)_minmax(120px,0.82fr)_minmax(110px,0.76fr)_88px] lg:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-slate-900">
                            {formatShortRequestId(loan.id)}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-slate-400">
                            {loan.paymentPeriod}
                          </p>
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-slate-900">{fullName}</p>
                          <p className="mt-1 truncate text-[11px] text-slate-400">{email}</p>
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-[13px] text-slate-700">{loan.phone}</p>
                          <p className="mt-1 truncate text-[11px] text-slate-400">
                            {formatDate(loan.createdAt)}
                          </p>
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-900">
                            {formatCurrency(loan.amount)}
                          </p>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span>Pagadas {paidRatio}</span>
                            <span>{Math.round(progress)}%</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${
                                inMora
                                  ? 'bg-orange-400'
                                  : loan.status === 'approved'
                                    ? 'bg-emerald-400'
                                    : loan.status === 'rejected'
                                      ? 'bg-rose-300'
                                      : 'bg-amber-400'
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <StatusPill status={loan.status} inMora={inMora} />
                        </div>

                        <div className="flex justify-end">
                          <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 transition hover:border-blue-300 hover:bg-slate-50">
                            Ver
                          </span>
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
