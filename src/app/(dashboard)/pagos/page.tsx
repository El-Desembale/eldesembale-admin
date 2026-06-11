'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { usePayments } from '@/hooks/usePayments';
import { useLoans } from '@/hooks/useLoans';
import { useUsers } from '@/hooks/useUsers';
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge';
import { Payment, LoanRequest } from '@/lib/types';
import { isInMora, getDaysOverdue } from '@/lib/mora';
import { wompiFeeFromGross } from '@/lib/loan-calc';
import { getBudgetConfig, setBudgetConfig } from '@/lib/firestore';
import Link from 'next/link';

type Tab = 'overview' | 'loans' | 'subscriptions';

const formatCOP = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);

const formatDate = (date: Date) =>
  date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function PagosPage() {
  const { payments, loading: loadingPayments, error, refetch } = usePayments();
  const { loans, loading: loadingLoans } = useLoans();
  const { users } = useUsers();
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [totalCapital, setTotalCapital] = useState<number>(0);
  const [loadingBudget, setLoadingBudget] = useState(true);

  useEffect(() => {
    getBudgetConfig().then(config => {
      if (config) setTotalCapital(config.totalCapital);
      setLoadingBudget(false);
    });
  }, []);

  const handleSaveBudget = useCallback(async (value: number) => {
    setTotalCapital(value);
    await setBudgetConfig(value);
  }, []);

  const loading = loadingPayments || loadingLoans || loadingBudget;

  const usersByPhone = useMemo(() => {
    const map: Record<string, { name: string; email: string }> = {};
    for (const u of users) {
      if (u.phone) map[u.phone] = { name: [u.name, u.lastName].filter(Boolean).join(' '), email: u.email };
    }
    return map;
  }, [users]);

  const finance = useMemo(() => {
    // Total a cobrar al cliente: modelo nuevo usa el desglose persistido; fallback al modelo
    // previo (total = capital × multiplicador de interés).
    const loanTotal = (l: typeof loans[number]) =>
      l.pricing ? l.pricing.totalCliente : l.amount * (l.interest || 1.1);

    // Agregados de las cuotas YA pagadas de un préstamo: capital recuperado, bruto cobrado
    // y comisión Wompi. Con desglose persistido es exacto; legacy se prorratea y la comisión
    // se estima con las tarifas por defecto.
    const paidAggregates = (l: typeof loans[number]) => {
      const n = l.installments;
      const paid = Math.min(l.installmentsPaid, n);
      if (l.pricing) {
        let capital = 0, gross = 0, wompi = 0;
        for (let i = 0; i < paid && i < l.pricing.installments.length; i++) {
          const c = l.pricing.installments[i];
          capital += c.capital;
          gross += c.totalCliente;
          wompi += c.comisionWompi;
        }
        return { capital, gross, wompi };
      }
      if (n <= 0 || paid <= 0) return { capital: 0, gross: 0, wompi: 0 };
      const perGross = loanTotal(l) / n;
      return {
        capital: paid * (l.amount / n),
        gross: paid * perGross,
        wompi: paid * wompiFeeFromGross(perGross),
      };
    };

    // Préstamos con capital comprometido o entregado.
    const activeLoans = loans.filter(l => l.status === 'approved' || l.status === 'disbursed');

    let capitalLent = 0;        // capital prestado (NO es ingreso)
    let capitalRecovered = 0;   // capital recuperado vía cuotas pagadas
    let installmentCollected = 0; // bruto cobrado en cuotas (capital + intereses + Wompi)
    let interestCollected = 0;  // ingreso financiero: lo cobrado por encima del capital
    let wompiInstallments = 0;  // comisiones Wompi de cuotas pagadas
    let wompiInstallmentsTotal = 0; // comisiones Wompi de TODAS las cuotas (pagadas + por pagar)
    let totalToCollect = 0;
    let totalInterest = 0;

    for (const l of activeLoans) {
      capitalLent += l.amount;
      totalToCollect += loanTotal(l);
      totalInterest += loanTotal(l) - l.amount;
      const agg = paidAggregates(l);
      capitalRecovered += agg.capital;
      installmentCollected += agg.gross;
      interestCollected += agg.gross - agg.capital;
      wompiInstallments += agg.wompi;
      // Comisión Wompi total del crédito (para proyectar la utilidad al cierre).
      wompiInstallmentsTotal += l.pricing
        ? l.pricing.wompiTotal
        : (l.installments > 0 ? wompiFeeFromGross(loanTotal(l) / l.installments) * l.installments : 0);
    }

    const capitalPending = capitalLent - capitalRecovered;
    const pendingToCollect = totalToCollect - installmentCollected;

    // Suscripciones: bruto pagado, comisión Wompi y neto recibido (desde pagos registrados).
    const subPayments = payments.filter(p => p.type === 'subscription' && p.status === 'APPROVED');
    const subscriptionGross = subPayments.reduce((sum, p) => sum + p.grossAmount, 0);
    const wompiSubscriptions = subPayments.reduce((sum, p) => sum + p.wompiFee, 0);
    const subscriptionNet = subPayments.reduce((sum, p) => sum + p.netAmount, 0);

    const totalWompi = wompiInstallments + wompiSubscriptions;
    // utilidad_neta = intereses_cobrados + suscripciones_brutas − total_comisiones_wompi.
    // El capital prestado/recuperado nunca entra en la utilidad.
    const netProfit = interestCollected + subscriptionGross - totalWompi;

    // Proyección al cierre: si todos los créditos activos se pagan completos.
    const pendingInterest = totalInterest - interestCollected;          // interés que falta por entrar
    const pendingWompi = Math.max(0, wompiInstallmentsTotal - wompiInstallments); // Wompi de cuotas por pagar
    const estimatedProfitAtClose = netProfit + pendingInterest - pendingWompi;

    const subscribedCount = users.filter(u => u.isSubscribed).length;
    const moraLoans = activeLoans.filter(isInMora);
    const moraCount = moraLoans.length;
    const capitalAtRisk = moraLoans.reduce((sum, l) => {
      if (l.installments <= 0) return sum;
      const remaining = l.installments - l.installmentsPaid;
      return sum + (remaining / l.installments) * loanTotal(l);
    }, 0);
    const completedLoans = activeLoans.filter(l => l.installmentsPaid >= l.installments).length;

    return {
      capitalLent, capitalRecovered, capitalPending,
      totalToCollect, totalInterest,
      installmentCollected, interestCollected, pendingToCollect,
      subscribedCount, subscriptionGross, subscriptionNet,
      wompiInstallments, wompiSubscriptions, totalWompi,
      pendingInterest, pendingWompi, estimatedProfitAtClose,
      netProfit, moraCount, capitalAtRisk,
      approvedLoansCount: activeLoans.length, completedLoans,
    };
  }, [loans, users, payments]);

  // Rango de fechas activo: filtra las transacciones (pagos) por fecha de creación.
  // Los saldos de capital del resumen son acumulados y no se ven afectados.
  const filteredPayments = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
    if (!from && !to) return payments;
    return payments.filter(p => (!from || p.createdAt >= from) && (!to || p.createdAt <= to));
  }, [payments, fromDate, toDate]);

  // Recaudación real (pagos registrados) dentro del rango: bruto, comisión Wompi y neto,
  // discriminando cuotas y suscripciones.
  const periodSummary = useMemo(() => {
    const approved = filteredPayments.filter(p => p.status === 'APPROVED');
    const inst = approved.filter(p => p.type === 'installment');
    const subs = approved.filter(p => p.type === 'subscription');
    const sum = (arr: Payment[], key: 'grossAmount' | 'wompiFee' | 'netAmount') =>
      arr.reduce((s, p) => s + p[key], 0);
    return {
      isFiltered: !!(fromDate || toDate),
      count: approved.length,
      grossTotal: sum(approved, 'grossAmount'),
      wompiTotal: sum(approved, 'wompiFee'),
      netTotal: sum(approved, 'netAmount'),
      installmentGross: sum(inst, 'grossAmount'),
      installmentCount: inst.length,
      subscriptionGross: sum(subs, 'grossAmount'),
      subscriptionCount: subs.length,
    };
  }, [filteredPayments, fromDate, toDate]);

  const subscribedUsers = useMemo(() => {
    const subPaymentsByPhone: Record<string, Payment> = {};
    for (const p of filteredPayments) {
      if (p.type === 'subscription' && p.status === 'APPROVED') {
        if (!subPaymentsByPhone[p.userPhone] || p.createdAt > subPaymentsByPhone[p.userPhone].createdAt) {
          subPaymentsByPhone[p.userPhone] = p;
        }
      }
    }
    const items = users
      .filter(u => u.isSubscribed)
      .map(u => {
        const payment = u.phone ? subPaymentsByPhone[u.phone] : undefined;
        return {
          user: u,
          name: [u.name, u.lastName].filter(Boolean).join(' ') || u.phone,
          // Suscripción discriminada: bruto pagado, comisión Wompi y neto recibido.
          grossAmount: payment?.grossAmount ?? 0,
          wompiFee: payment?.wompiFee ?? 0,
          netAmount: payment?.netAmount ?? 0,
          date: payment?.createdAt || null,
          hasPaymentRecord: !!payment,
        };
      })
      // Con rango de fechas activo, solo se muestran suscripciones con pago en el período.
      .filter(item => !(fromDate || toDate) || item.hasPaymentRecord);
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(item =>
      item.name.toLowerCase().includes(q) || item.user.phone.includes(q) || item.user.email.toLowerCase().includes(q),
    );
  }, [users, filteredPayments, search, fromDate, toDate]);

  const loanTracking = useMemo(() => {
    const paymentsByLoan: Record<string, Payment[]> = {};
    for (const p of filteredPayments) {
      if (p.type === 'installment' && p.loanId) {
        if (!paymentsByLoan[p.loanId]) paymentsByLoan[p.loanId] = [];
        paymentsByLoan[p.loanId].push(p);
      }
    }
    const dateFilterActive = !!(fromDate || toDate);
    const approvedLoans = loans.filter(l => l.status === 'approved' || l.status === 'disbursed');
    const items = approvedLoans
      // Con rango de fechas activo, solo préstamos con pagos en el período.
      .filter(loan => !dateFilterActive || (paymentsByLoan[loan.id]?.length ?? 0) > 0)
      .map(loan => {
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
  }, [loans, filteredPayments, usersByPhone, search, fromDate, toDate]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-slate-900 text-2xl font-bold">Finanzas y Pagos</h1>
          <p className="text-slate-500 text-sm mt-1">
            {finance.approvedLoansCount} préstamos activos · {finance.subscribedCount} suscritos
          </p>
        </div>
        <button
          onClick={refetch}
          className="text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg text-sm hover:bg-blue-50 transition-colors font-medium"
        >
          Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'overview' as const, label: 'Resumen Financiero' },
          { key: 'loans' as const, label: 'Seguimiento Préstamos' },
          { key: 'subscriptions' as const, label: 'Suscripciones' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtro por fechas (aplica a las transacciones de pago) */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="flex flex-col">
          <label className="text-xs text-slate-400 mb-1">Desde</label>
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={e => setFromDate(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors shadow-sm"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate-400 mb-1">Hasta</label>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={e => setToDate(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors shadow-sm"
          />
        </div>
        {(fromDate || toDate) && (
          <button
            onClick={() => { setFromDate(''); setToDate(''); }}
            className="text-slate-500 border border-slate-200 px-3 py-2 rounded-xl text-sm hover:bg-slate-50 transition-colors"
          >
            Limpiar
          </button>
        )}
        <span className="text-sm text-slate-400 pb-1">
          {periodSummary.count} pago{periodSummary.count === 1 ? '' : 's'}
          {periodSummary.isFiltered ? ' en el período' : ' registrados'}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="text-red-500 text-center py-8">{error}</p>
      ) : tab === 'overview' ? (
        <FinancialOverview finance={finance} period={periodSummary} totalCapital={totalCapital} onSaveBudget={handleSaveBudget} />
      ) : tab === 'loans' ? (
        <>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors mb-6 shadow-sm"
          />
          <LoansTrackingView items={loanTracking} />
        </>
      ) : (
        <>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors mb-6 shadow-sm"
          />
          <SubscriptionsView items={subscribedUsers} />
        </>
      )}
    </div>
  );
}

// ─── Resumen Financiero ───

interface FinanceData {
  // Capital (no es ingreso ni utilidad)
  capitalLent: number;
  capitalRecovered: number;
  capitalPending: number;
  // Recaudación de cuotas
  totalToCollect: number;
  totalInterest: number;
  installmentCollected: number;
  pendingToCollect: number;
  // Ingresos
  interestCollected: number;
  subscriptionGross: number;
  subscriptionNet: number;
  // Costos (comisiones Wompi)
  wompiInstallments: number;
  wompiSubscriptions: number;
  totalWompi: number;
  // Proyección al cierre
  pendingInterest: number;
  pendingWompi: number;
  estimatedProfitAtClose: number;
  // Utilidad
  netProfit: number;
  // Otros indicadores
  subscribedCount: number;
  moraCount: number;
  capitalAtRisk: number;
  approvedLoansCount: number;
  completedLoans: number;
}

interface PeriodSummary {
  isFiltered: boolean;
  count: number;
  grossTotal: number;
  wompiTotal: number;
  netTotal: number;
  installmentGross: number;
  installmentCount: number;
  subscriptionGross: number;
  subscriptionCount: number;
}

function FinancialOverview({ finance, period, totalCapital, onSaveBudget }: { finance: FinanceData; period: PeriodSummary; totalCapital: number; onSaveBudget: (v: number) => Promise<void> }) {
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const availableFunds = totalCapital - finance.capitalLent + finance.capitalRecovered;

  const handleBudgetSave = async () => {
    const val = parseInt(budgetInput.replace(/\D/g, ''), 10);
    if (!val || val <= 0) return;
    setSavingBudget(true);
    await onSaveBudget(val);
    setEditingBudget(false);
    setSavingBudget(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── GANANCIA: intereses recolectados + suscripciones − Wompi ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <p className="text-slate-500 text-sm">Ganancia · lo que ya ganaste</p>
          <span className="text-[11px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">Acumulado</span>
        </div>
        <p className={`font-bold text-4xl mb-5 ${finance.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {formatCOP(finance.netProfit)}
        </p>

        <div className="flex flex-col gap-2 text-sm">
          <CascadeRow label="Intereses recolectados" value={finance.interestCollected} sign="+" />
          <CascadeRow label="Suscripciones cobradas" value={finance.subscriptionGross} sign="+" />
          <CascadeRow label="Comisiones Wompi (gasto operativo)" value={finance.totalWompi} sign="−" />
          <div className="flex justify-between items-center border-t-2 border-slate-200 pt-3 mt-1">
            <span className="text-slate-900 font-bold">Ganancia</span>
            <span className={`font-bold text-lg ${finance.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCOP(finance.netProfit)}</span>
          </div>
        </div>

        <div className="flex justify-between items-center mt-4 pt-3 border-t border-dashed border-slate-200">
          <span className="text-slate-500 text-sm">Ganancia estimada al cierre <span className="text-slate-400">· si todos pagan</span></span>
          <span className="text-blue-600 font-semibold">{formatCOP(finance.estimatedProfitAtClose)}</span>
        </div>
        <p className="text-slate-400 text-xs mt-3">
          El capital es dinero que rota, no ganancia. Wompi es gasto operativo, tampoco es ganancia.
        </p>
      </div>

      {/* ── CAPITAL · el dinero que está rotando (no es ganancia) ── */}
      <div>
        <h3 className="text-slate-700 font-semibold mb-3 text-xs uppercase tracking-wider">Capital · el dinero que está rotando</h3>
        <div className={`border rounded-2xl p-5 shadow-sm ${availableFunds <= 0 && totalCapital > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-slate-500 text-sm mb-1">Disponible para prestar</p>
              <p className={`font-bold text-3xl ${availableFunds <= 0 && totalCapital > 0 ? 'text-red-500' : 'text-blue-600'}`}>
                {totalCapital > 0 ? formatCOP(availableFunds) : 'Sin configurar'}
              </p>
              {totalCapital > 0 && (
                <p className="text-slate-400 text-xs mt-1">Capital total {formatCOP(totalCapital)} − prestado + recuperado</p>
              )}
            </div>
            {!editingBudget && (
              <button
                onClick={() => { setEditingBudget(true); setBudgetInput(totalCapital > 0 ? String(totalCapital) : ''); }}
                className="text-blue-600 text-sm hover:underline whitespace-nowrap font-medium"
              >
                {totalCapital > 0 ? 'Editar' : 'Configurar'}
              </button>
            )}
          </div>
          {editingBudget && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="text-slate-400 text-xs mb-2">Capital total disponible para préstamos</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={budgetInput}
                  onChange={e => setBudgetInput(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Ej: 5000000"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={handleBudgetSave}
                  disabled={savingBudget}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingBudget ? '...' : 'Guardar'}
                </button>
                <button
                  onClick={() => setEditingBudget(false)}
                  className="text-slate-400 px-3 py-2 text-sm hover:text-slate-600"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
            <CapItem label="Prestado" value={formatCOP(finance.capitalLent)} sublabel={`${finance.approvedLoansCount} préstamos · ya se desembolsó`} />
            <CapItem label="Recuperado" value={formatCOP(finance.capitalRecovered)} sublabel="ya volvió en cuotas" valueClass="text-emerald-600" />
            <CapItem label="Pendiente por recuperar" value={formatCOP(finance.capitalPending)} sublabel={finance.moraCount > 0 ? `${finance.moraCount} en mora · ${formatCOP(finance.capitalAtRisk)} en riesgo` : 'al día'} valueClass="text-yellow-600" />
          </div>
        </div>
      </div>

      {/* ── INTERÉS · es ganancia ── */}
      <div>
        <h3 className="text-slate-700 font-semibold mb-3 text-xs uppercase tracking-wider">Interés · es ganancia</h3>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Recolectado" value={formatCOP(finance.interestCollected)} sublabel="ya cobrado · suma a la ganancia" color="text-emerald-600" />
          <MetricCard label="Pendiente" value={formatCOP(finance.pendingInterest)} sublabel="por cobrar" color="text-yellow-600" />
        </div>
      </div>

      {/* ── SUSCRIPCIONES · es ganancia ── */}
      <div>
        <h3 className="text-slate-700 font-semibold mb-3 text-xs uppercase tracking-wider">Suscripciones · es ganancia</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <MetricCard label="Cobradas (bruto)" value={formatCOP(finance.subscriptionGross)} sublabel="suma a la ganancia" color="text-emerald-600" />
          <MetricCard label="Netas" value={formatCOP(finance.subscriptionNet)} sublabel="después de Wompi" color="text-slate-900" />
          <MetricCard label="Suscritos" value={String(finance.subscribedCount)} color="text-slate-900" />
        </div>
      </div>

      {/* ── WOMPI · gasto operativo (no es ganancia) ── */}
      <div>
        <h3 className="text-slate-700 font-semibold mb-3 text-xs uppercase tracking-wider">Wompi · gasto operativo (no es ganancia)</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <MetricCard label="Comisión por pagos" value={formatCOP(finance.wompiInstallments)} sublabel="de cuotas pagadas" color="text-red-500" />
          <MetricCard label="Comisión por suscripciones" value={formatCOP(finance.wompiSubscriptions)} color="text-red-500" />
          <MetricCard label="Total Wompi" value={formatCOP(finance.totalWompi)} color="text-red-500" />
        </div>
      </div>

      {/* ── Movimiento de caja en el período (pagos registrados, sensible al filtro) ── */}
      <div>
        <h3 className="text-slate-700 font-semibold mb-3 text-xs uppercase tracking-wider">
          {period.isFiltered ? 'Caja · recaudado en el período' : 'Caja · recaudado (pagos registrados)'}
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Bruto recaudado" value={formatCOP(period.grossTotal)} sublabel={`${period.count} transacciones`} color="text-slate-900" />
          <MetricCard label="Comisiones Wompi" value={formatCOP(period.wompiTotal)} color="text-red-500" />
          <MetricCard label="Neto recibido" value={formatCOP(period.netTotal)} color="text-emerald-600" />
          <MetricCard label="Cuotas / Suscripciones" value={`${period.installmentCount} / ${period.subscriptionCount}`} sublabel={`${formatCOP(period.installmentGross)} · ${formatCOP(period.subscriptionGross)}`} color="text-slate-900" />
        </div>
        {!period.isFiltered && (
          <p className="text-slate-400 text-xs mt-2">Usa el filtro de fechas (arriba) para ver lo recaudado en un rango específico.</p>
        )}
      </div>
    </div>
  );
}

// Fila de cascada: etiqueta a la izquierda, monto con signo + (verde) o − (rojo) a la derecha.
function CascadeRow({ label, value, sign }: { label: string; value: number; sign: '+' | '−' }) {
  const positive = sign === '+';
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-500">{label}</span>
      <span className={positive ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
        {sign} {formatCOP(value)}
      </span>
    </div>
  );
}

function MetricCard({ label, value, sublabel, color = 'text-slate-900' }: { label: string; value: string; sublabel?: string; color?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <p className="text-slate-400 text-xs">{label}</p>
      <p className={`${color} font-bold text-lg`}>{value}</p>
      {sublabel && <p className="text-slate-400 text-xs mt-0.5">{sublabel}</p>}
    </div>
  );
}

// Sub-métrica dentro del panel de Capital (sin tarjeta propia).
function CapItem({ label, value, sublabel, valueClass = 'text-slate-900' }: { label: string; value: string; sublabel?: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-slate-400 text-xs">{label}</p>
      <p className={`${valueClass} font-bold text-base`}>{value}</p>
      {sublabel && <p className="text-slate-400 text-[11px] mt-0.5">{sublabel}</p>}
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
    return <p className="text-slate-400 text-center py-8">No hay préstamos aprobados</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map(item => {
        const expanded = expandedId === item.loan.id;
        return (
          <div
            key={item.loan.id}
            className={`bg-white rounded-xl border transition-all shadow-sm ${
              item.mora
                ? 'border-orange-200'
                : item.completed
                  ? 'border-blue-200'
                  : 'border-slate-200'
            }`}
          >
            <button
              onClick={() => setExpandedId(expanded ? null : item.loan.id)}
              className="w-full p-4 text-left"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-slate-900 font-semibold">{item.userName}</p>
                    {item.mora && (
                      <span className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full font-medium border border-orange-200">
                        {item.daysOverdue}d en mora
                      </span>
                    )}
                    {item.completed && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium border border-blue-200">
                        Completado
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm">{item.loan.phone}</p>
                </div>
                <div className="text-right ml-3">
                  <p className="text-slate-900 font-bold">{formatCOP(item.loan.amount)}</p>
                  <p className="text-slate-400 text-xs">{item.loan.paymentPeriod}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.mora ? 'bg-orange-400' : item.completed ? 'bg-blue-500' : 'bg-blue-400'
                    }`}
                    style={{ width: `${Math.min(item.progress, 100)}%` }}
                  />
                </div>
                <span className="text-sm text-slate-600 whitespace-nowrap">
                  {item.loan.installmentsPaid}/{item.loan.installments} cuotas
                </span>
                <span className="text-slate-400 text-sm">{expanded ? '▲' : '▼'}</span>
              </div>

              <div className="flex gap-4 mt-2 text-xs text-slate-400">
                <span>Pagado: {formatCOP(item.paidAmount)}</span>
                {item.loan.pricing
                  ? <span>Total: {formatCOP(item.loan.pricing.totalCliente)}</span>
                  : <span>{item.loan.interest}% interés</span>}
                <span>{item.approvedPayments.length} pagos registrados</span>
              </div>
            </button>

            {expanded && (
              <div className="border-t border-slate-200 px-4 pb-4">
                {/* Desglose financiero del préstamo: capital, intereses, Wompi y ganancia neta */}
                {(() => {
                  const p = item.loan.pricing;
                  const total = p ? p.totalCliente : item.loan.amount * (item.loan.interest || 1.1);
                  const capital = item.loan.amount;
                  const wompi = p
                    ? p.wompiTotal
                    : wompiFeeFromGross(total / Math.max(item.loan.installments, 1)) * Math.max(item.loan.installments, 1);
                  const interest = total - capital;
                  const netGain = total - capital - wompi;
                  return (
                    <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
                      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Capital</p>
                        <p className="text-slate-900 text-sm font-semibold">{formatCOP(capital)}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Intereses</p>
                        <p className="text-blue-600 text-sm font-semibold">{formatCOP(interest)}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Comisiones Wompi</p>
                        <p className="text-red-500 text-sm font-semibold">{formatCOP(wompi)}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Ganancia neta</p>
                        <p className={`text-sm font-semibold ${netGain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCOP(netGain)}</p>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between mt-3 mb-2">
                  <p className="text-slate-400 text-xs font-medium">Historial de pagos</p>
                  <Link
                    href={`/solicitudes/${item.loan.id}`}
                    className="text-blue-600 text-xs hover:underline font-medium"
                  >
                    Ver préstamo →
                  </Link>
                </div>
                {item.loanPayments.length === 0 ? (
                  <p className="text-slate-400 text-sm py-2">Sin pagos registrados</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {item.loanPayments.map(payment => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <PaymentStatusBadge status={payment.status} />
                          <div>
                            <p className="text-slate-900 text-sm">
                              Cuota #{payment.installmentNumber || '—'}
                            </p>
                            <p className="text-slate-400 text-xs">{formatDate(payment.createdAt)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-900 text-sm font-medium">{formatCOP(payment.grossAmount)}</p>
                          <p className="text-slate-400 text-[11px]">
                            Wompi {formatCOP(payment.wompiFee)} · Neto {formatCOP(payment.netAmount)}
                          </p>
                        </div>
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

interface SubscribedItem {
  user: { id: string; name: string; lastName: string; phone: string; email: string };
  name: string;
  grossAmount: number;
  wompiFee: number;
  netAmount: number;
  date: Date | null;
  hasPaymentRecord: boolean;
}

function SubscriptionsView({ items }: { items: SubscribedItem[] }) {
  if (items.length === 0) {
    return <p className="text-slate-400 text-center py-8">No hay usuarios suscritos</p>;
  }

  const withPayment = items.filter(i => i.hasPaymentRecord);
  const totalGross = withPayment.reduce((s, i) => s + i.grossAmount, 0);
  const totalFee = withPayment.reduce((s, i) => s + i.wompiFee, 0);
  const totalNet = withPayment.reduce((s, i) => s + i.netAmount, 0);

  return (
    <div className="flex flex-col gap-2">
      {/* Totales: bruto cobrado, comisión Wompi y neto recibido */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <p className="text-slate-400 text-xs">Bruto cobrado</p>
          <p className="text-blue-600 font-bold">{formatCOP(totalGross)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <p className="text-slate-400 text-xs">Comisión Wompi</p>
          <p className="text-red-500 font-bold">{formatCOP(totalFee)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <p className="text-slate-400 text-xs">Neto recibido</p>
          <p className="text-emerald-600 font-bold">{formatCOP(totalNet)}</p>
        </div>
      </div>
      {items.map(item => (
        <Link key={item.user.id} href={`/usuarios/${item.user.id}`}>
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between hover:border-blue-300 hover:shadow-md transition-all shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                {(item.name?.[0] || '?').toUpperCase()}
              </div>
              <div>
                <p className="text-slate-900 font-medium">{item.name}</p>
                <p className="text-slate-400 text-xs">{item.user.phone} · {item.user.email}</p>
              </div>
            </div>
            <div className="text-right">
              {item.hasPaymentRecord ? (
                <>
                  <p className="text-blue-600 font-semibold">{formatCOP(item.grossAmount)}</p>
                  <p className="text-slate-400 text-xs">
                    Wompi {formatCOP(item.wompiFee)} · Neto <span className="text-emerald-600 font-medium">{formatCOP(item.netAmount)}</span>
                  </p>
                </>
              ) : (
                <p className="text-slate-400 font-medium text-sm">Sin registro de pago</p>
              )}
              {item.date && <p className="text-slate-400 text-xs">{formatDate(item.date)}</p>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
