'use client';

import { useState, useMemo } from 'react';
import { usePayments } from '@/hooks/usePayments';
import { useLoans } from '@/hooks/useLoans';
import { useUsers } from '@/hooks/useUsers';
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge';
import { Payment, PAYMENT_STATUS_LABELS, LoanRequest } from '@/lib/types';
import { isInMora, getDaysOverdue } from '@/lib/mora';
import Link from 'next/link';

type Tab = 'subscriptions' | 'loans';

const formatCOP = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);

const formatDate = (date: Date) =>
  date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function PagosPage() {
  const { payments, loading: loadingPayments, error, refetch } = usePayments();
  const { loans, loading: loadingLoans } = useLoans();
  const { users } = useUsers();
  const [tab, setTab] = useState<Tab>('loans');
  const [search, setSearch] = useState('');

  const loading = loadingPayments || loadingLoans;

  // User lookup by phone
  const usersByPhone = useMemo(() => {
    const map: Record<string, { name: string; email: string }> = {};
    for (const u of users) {
      if (u.phone) map[u.phone] = { name: [u.name, u.lastName].filter(Boolean).join(' '), email: u.email };
    }
    return map;
  }, [users]);

  // Summary metrics
  const totalApproved = useMemo(() =>
    payments.filter(p => p.status === 'APPROVED').reduce((sum, p) => sum + p.amount, 0),
  [payments]);
  const subscriptionRevenue = useMemo(() =>
    payments.filter(p => p.type === 'subscription' && p.status === 'APPROVED').reduce((sum, p) => sum + p.amount, 0),
  [payments]);
  const installmentRevenue = useMemo(() =>
    payments.filter(p => p.type === 'installment' && p.status === 'APPROVED').reduce((sum, p) => sum + p.amount, 0),
  [payments]);

  // Subscription payments
  const subscriptionPayments = useMemo(() => {
    const subs = payments.filter(p => p.type === 'subscription');
    if (!search) return subs;
    const q = search.toLowerCase();
    return subs.filter(p =>
      p.userPhone.includes(q) || p.userName.toLowerCase().includes(q) || p.userEmail.toLowerCase().includes(q),
    );
  }, [payments, search]);

  // Loans with payment data
  const loanTracking = useMemo(() => {
    const paymentsByLoan: Record<string, Payment[]> = {};
    for (const p of payments) {
      if (p.type === 'installment' && p.loanId) {
        if (!paymentsByLoan[p.loanId]) paymentsByLoan[p.loanId] = [];
        paymentsByLoan[p.loanId].push(p);
      }
    }

    const approvedLoans = loans.filter(l => l.status === 'approved');

    const items = approvedLoans.map(loan => {
      const loanPayments = paymentsByLoan[loan.id] || [];
      const approvedPayments = loanPayments.filter(p => p.status === 'APPROVED');
      const paidAmount = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
      const userName = usersByPhone[loan.phone]?.name || loan.phone;
      const mora = isInMora(loan);
      const daysOverdue = getDaysOverdue(loan);
      const progress = loan.installments > 0 ? (loan.installmentsPaid / loan.installments) * 100 : 0;
      const completed = loan.installmentsPaid >= loan.installments;

      return { loan, loanPayments, approvedPayments, paidAmount, userName, mora, daysOverdue, progress, completed };
    });

    // Sort: mora first, then by progress ascending
    items.sort((a, b) => {
      if (a.mora && !b.mora) return -1;
      if (!a.mora && b.mora) return 1;
      if (a.completed && !b.completed) return 1;
      if (!a.completed && b.completed) return -1;
      return a.progress - b.progress;
    });

    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(item =>
      item.userName.toLowerCase().includes(q) || item.loan.phone.includes(q),
    );
  }, [loans, payments, usersByPhone, search]);

  const moraCount = loanTracking.filter(t => t.mora).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-bold">Pagos</h1>
          <p className="text-gray-400 text-sm mt-1">
            {payments.length} transacciones registradas
          </p>
        </div>
        <button
          onClick={refetch}
          className="text-[#2FFF00] border border-[#2FFF00]/30 px-3 py-1.5 rounded-lg text-sm hover:bg-[#2FFF00]/10 transition-colors"
        >
          Actualizar
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#0d1f0d] border border-[#2FFF00]/20 rounded-xl p-4">
          <p className="text-gray-500 text-xs">Total recaudado</p>
          <p className="text-[#2FFF00] font-bold text-lg">{formatCOP(totalApproved)}</p>
        </div>
        <div className="bg-[#0d1f0d] border border-[#2FFF00]/20 rounded-xl p-4">
          <p className="text-gray-500 text-xs">Suscripciones</p>
          <p className="text-white font-bold text-lg">{formatCOP(subscriptionRevenue)}</p>
        </div>
        <div className="bg-[#0d1f0d] border border-[#2FFF00]/20 rounded-xl p-4">
          <p className="text-gray-500 text-xs">Cuotas cobradas</p>
          <p className="text-white font-bold text-lg">{formatCOP(installmentRevenue)}</p>
        </div>
        <div className="bg-[#0d1f0d] border border-[#2FFF00]/20 rounded-xl p-4">
          <p className="text-gray-500 text-xs">En mora</p>
          <p className={`font-bold text-lg ${moraCount > 0 ? 'text-orange-400' : 'text-white'}`}>{moraCount} préstamos</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('loans')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            tab === 'loans' ? 'bg-[#2FFF00] text-black' : 'bg-[#2FFF00]/10 text-[#2FFF00] hover:bg-[#2FFF00]/20'
          }`}
        >
          Seguimiento Préstamos
        </button>
        <button
          onClick={() => setTab('subscriptions')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            tab === 'subscriptions' ? 'bg-[#2FFF00] text-black' : 'bg-[#2FFF00]/10 text-[#2FFF00] hover:bg-[#2FFF00]/20'
          }`}
        >
          Suscripciones
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por nombre o teléfono..."
        className="w-full bg-[#0d1f0d] border border-[#2FFF00]/20 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#2FFF00]/60 transition-colors mb-6"
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#2FFF00] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="text-red-400 text-center py-8">{error}</p>
      ) : tab === 'loans' ? (
        <LoansTrackingView items={loanTracking} />
      ) : (
        <SubscriptionsView payments={subscriptionPayments} />
      )}
    </div>
  );
}

// ─── Seguimiento de Préstamos ───

interface LoanTrackingItem {
  loan: LoanRequest;
  loanPayments: Payment[];
  approvedPayments: Payment[];
  paidAmount: number;
  userName: string;
  mora: boolean;
  daysOverdue: number;
  progress: number;
  completed: boolean;
}

function LoansTrackingView({ items }: { items: LoanTrackingItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="text-gray-500 text-center py-8">No hay préstamos aprobados</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map(item => {
        const expanded = expandedId === item.loan.id;
        return (
          <div
            key={item.loan.id}
            className={`bg-[#0d1f0d] rounded-xl border transition-all ${
              item.mora
                ? 'border-orange-500/50'
                : item.completed
                  ? 'border-[#2FFF00]/40'
                  : 'border-[#2FFF00]/20'
            }`}
          >
            {/* Loan header - clickable */}
            <button
              onClick={() => setExpandedId(expanded ? null : item.loan.id)}
              className="w-full p-4 text-left"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-semibold">{item.userName}</p>
                    {item.mora && (
                      <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-medium">
                        {item.daysOverdue}d en mora
                      </span>
                    )}
                    {item.completed && (
                      <span className="text-xs bg-[#2FFF00]/20 text-[#2FFF00] px-2 py-0.5 rounded-full font-medium">
                        Completado
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm">{item.loan.phone}</p>
                </div>
                <div className="text-right ml-3">
                  <p className="text-white font-bold">{formatCOP(item.loan.amount)}</p>
                  <p className="text-gray-500 text-xs">{item.loan.paymentPeriod}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-white/10 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.mora ? 'bg-orange-500' : item.completed ? 'bg-[#2FFF00]' : 'bg-[#2FFF00]/70'
                    }`}
                    style={{ width: `${Math.min(item.progress, 100)}%` }}
                  />
                </div>
                <span className="text-sm text-gray-300 whitespace-nowrap">
                  {item.loan.installmentsPaid}/{item.loan.installments} cuotas
                </span>
                <span className="text-gray-600 text-sm">{expanded ? '▲' : '▼'}</span>
              </div>

              {/* Quick stats */}
              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                <span>Pagado: {formatCOP(item.paidAmount)}</span>
                <span>{item.loan.interest}% interés</span>
                <span>{item.approvedPayments.length} pagos registrados</span>
              </div>
            </button>

            {/* Expanded: payment history */}
            {expanded && (
              <div className="border-t border-white/10 px-4 pb-4">
                <div className="flex items-center justify-between mt-3 mb-2">
                  <p className="text-gray-400 text-xs font-medium">Historial de pagos</p>
                  <Link
                    href={`/solicitudes/${item.loan.id}`}
                    className="text-[#2FFF00] text-xs hover:underline"
                  >
                    Ver préstamo →
                  </Link>
                </div>
                {item.loanPayments.length === 0 ? (
                  <p className="text-gray-600 text-sm py-2">Sin pagos registrados</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {item.loanPayments.map(payment => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between bg-[#061006] rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <PaymentStatusBadge status={payment.status} />
                          <div>
                            <p className="text-white text-sm">
                              Cuota #{payment.installmentNumber || '—'}
                            </p>
                            <p className="text-gray-600 text-xs">{formatDate(payment.createdAt)}</p>
                          </div>
                        </div>
                        <p className="text-white text-sm font-medium">{formatCOP(payment.amount)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Suscripciones ───

function SubscriptionsView({ payments }: { payments: Payment[] }) {
  if (payments.length === 0) {
    return <p className="text-gray-500 text-center py-8">No hay suscripciones</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {payments.map(payment => (
        <div
          key={payment.id}
          className="bg-[#0d1f0d] border border-[#2FFF00]/20 rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#2FFF00]/15 flex items-center justify-center text-[#2FFF00] font-bold text-sm">
              {(payment.userName?.[0] || payment.userPhone?.[0] || '?').toUpperCase()}
            </div>
            <div>
              <p className="text-white font-medium">{payment.userName || payment.userPhone}</p>
              <p className="text-gray-500 text-xs">{payment.userPhone} · {payment.userEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-white font-semibold">{formatCOP(payment.amount)}</p>
              <p className="text-gray-600 text-xs">{formatDate(payment.createdAt)}</p>
            </div>
            <PaymentStatusBadge status={payment.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
