'use client';

import { useState } from 'react';
import { LoanRequest, Payment, User, STATUS_LABELS, STATUS_COLORS } from '@/lib/types';
import {
  computeRisk, computeFinancialSummary, getInstallmentSchedule, installmentAmount, totalRepayable,
  RISK_LABELS, RISK_COLORS, type RiskAssessment, type FinancialSummary,
} from '@/lib/risk';
import { isInMora } from '@/lib/mora';

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ─── Perfil de riesgo + cupo + alertas ───
export function RiskCard({ risk }: { risk: RiskAssessment }) {
  const color = RISK_COLORS[risk.profile];
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-slate-900 font-semibold mb-1">Perfil de riesgo</h2>
          <p className="text-slate-400 text-xs">Calculado a partir del comportamiento de pago</p>
        </div>
        <span className="inline-flex rounded-full px-3 py-1.5 text-sm font-bold" style={{ backgroundColor: `${color}22`, color }}>
          {RISK_LABELS[risk.profile]}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-slate-400 text-[11px]">Cupo máximo</p>
          <p className="text-slate-900 font-bold text-lg">{fmt(risk.maxLoanAmount)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-slate-400 text-[11px]">Préstamos pagados</p>
          <p className="text-slate-900 font-bold text-lg">{risk.paidLoans}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-slate-400 text-[11px]">Préstamos activos</p>
          <p className="text-slate-900 font-bold text-lg">{risk.activeLoans}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-slate-400 text-[11px]">Cuotas en mora</p>
          <p className={`font-bold text-lg ${risk.currentLateInstallments > 0 ? 'text-orange-500' : 'text-slate-900'}`}>{risk.currentLateInstallments}</p>
        </div>
      </div>

      {/* Alertas */}
      {risk.isBlockedForNewLoans ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-rose-700 text-sm font-semibold">🚫 Bloqueado para nuevos créditos</p>
          <p className="text-rose-600 text-xs mt-1">{risk.reason}</p>
        </div>
      ) : risk.profile === 'MEDIUM_RISK' ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-amber-700 text-sm font-semibold">⚠️ No aplica para aumento de cupo</p>
          <p className="text-amber-600 text-xs mt-1">{risk.reason}</p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
          <p className="text-slate-600 text-xs">{risk.reason}</p>
        </div>
      )}
    </div>
  );
}

// ─── Resumen financiero ───
export function FinancialSummaryCard({ s }: { s: FinancialSummary }) {
  const items: { label: string; value: string; accent?: string }[] = [
    { label: 'Solicitudes', value: String(s.totalRequested) },
    { label: 'Aprobadas', value: String(s.totalApproved) },
    { label: 'Rechazadas', value: String(s.totalRejected) },
    { label: 'Desembolsado', value: fmt(s.totalDisbursedAmount) },
    { label: 'Total a pagar', value: fmt(s.totalToRepay) },
    { label: 'Pagado', value: fmt(s.totalPaid), accent: 'text-emerald-600' },
    { label: 'Saldo pendiente', value: fmt(s.pendingBalance), accent: 'text-amber-600' },
    { label: 'Mora acumulada', value: fmt(s.accruedLateAmount), accent: s.accruedLateAmount > 0 ? 'text-orange-500' : undefined },
    { label: 'Cuotas pagadas', value: String(s.paidInstallments) },
    { label: 'Cuotas pendientes', value: String(s.pendingInstallments) },
    { label: 'Cuotas en mora', value: String(s.lateInstallments), accent: s.lateInstallments > 0 ? 'text-orange-500' : undefined },
    { label: 'Última solicitud', value: fmtDate(s.lastLoanDate) },
  ];
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm">
      <h2 className="text-slate-900 font-semibold mb-4">Resumen financiero</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map(it => (
          <div key={it.label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-slate-400 text-[11px]">{it.label}</p>
            <p className={`font-bold text-sm mt-0.5 ${it.accent || 'text-slate-900'}`}>{it.value}</p>
          </div>
        ))}
      </div>
      {s.lastPaymentDate && (
        <p className="text-slate-400 text-xs mt-3">Último pago: {fmtDate(s.lastPaymentDate)}</p>
      )}
    </div>
  );
}

// ─── Referencias ───
export function ReferencesCard({ loans, user }: { loans: LoanRequest[]; user: User }) {
  // Referencias personales: de la solicitud más reciente que las tenga
  const loanWithRefs = [...loans]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .find(l => l.loanInformation.firstReference.relationship || l.loanInformation.secondReference.relationship);

  const personal = loanWithRefs
    ? [loanWithRefs.loanInformation.firstReference, loanWithRefs.loanInformation.secondReference]
        .filter(r => r.relationship || r.phone)
    : [];
  const work = user.workReferences || [];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm">
      <h2 className="text-slate-900 font-semibold mb-4">Referencias</h2>

      <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Personales</p>
      {personal.length === 0 ? (
        <p className="text-slate-400 text-sm mb-4">Este usuario no tiene referencias personales registradas.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 mb-5">
          {personal.map((r, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">
                  {[r.name, r.lastName].filter(Boolean).join(' ') || 'Sin nombre'}
                </p>
                <span className="text-[11px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{r.relationship || '—'}</span>
              </div>
              <p className="text-slate-500 text-xs mt-1">📞 {r.phone || '—'}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Laborales</p>
      {work.length === 0 ? (
        <p className="text-slate-400 text-sm">Este usuario no tiene referencias laborales registradas.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {work.map((w, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-sm font-semibold text-slate-900">{w.companyName}</p>
              {w.userPosition && <p className="text-slate-500 text-xs mt-1">Cargo: {w.userPosition}</p>}
              {w.contactName && <p className="text-slate-500 text-xs">Contacto: {w.contactName}</p>}
              {w.contactPhone && <p className="text-slate-500 text-xs">📞 {w.contactPhone}</p>}
              {w.employmentTime && <p className="text-slate-500 text-xs">Antigüedad: {w.employmentTime}</p>}
              {w.contractType && <p className="text-slate-500 text-xs">Contrato: {w.contractType}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Historial de préstamos con cuotas ───
export function LoanHistoryCard({ loans }: { loans: LoanRequest[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (loans.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm">
      <h2 className="text-slate-900 font-semibold mb-4">Historial de préstamos y cuotas</h2>
      <div className="flex flex-col gap-3">
        {loans.map(loan => {
          const per = installmentAmount(loan);
          const total = totalRepayable(loan);
          const paid = Math.min(loan.installmentsPaid, loan.installments);
          const remaining = Math.max(loan.installments - loan.installmentsPaid, 0);
          const mora = isInMora(loan);
          const schedule = getInstallmentSchedule(loan);
          const isOpen = open === loan.id;
          return (
            <div key={loan.id} className={`rounded-xl border ${mora ? 'border-orange-200' : 'border-slate-200'}`}>
              <button onClick={() => setOpen(isOpen ? null : loan.id)} className="w-full text-left p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-900 font-bold">{fmt(loan.amount)}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ backgroundColor: `${STATUS_COLORS[loan.status]}22`, color: STATUS_COLORS[loan.status] }}>
                      {STATUS_LABELS[loan.status]}
                    </span>
                    {mora && <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">En mora</span>}
                  </div>
                  <span className="text-slate-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
                  <span>Solicitado: {fmtDate(loan.createdAt)}</span>
                  <span>{loan.installments} cuotas · {loan.paymentPeriod}</span>
                  <span>Por cuota: {fmt(per)}</span>
                  <span>Total: {fmt(total)}</span>
                  <span>Pagadas: {paid}/{loan.installments}</span>
                  <span>Saldo: {fmt(remaining * per)}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-200 p-4">
                  {schedule.length === 0 ? (
                    <p className="text-slate-400 text-sm">Este préstamo no tiene cuotas generadas.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 text-left">
                            <th className="py-1.5 pr-3 font-medium">#</th>
                            <th className="py-1.5 pr-3 font-medium">Valor</th>
                            <th className="py-1.5 pr-3 font-medium">Vence</th>
                            <th className="py-1.5 pr-3 font-medium">Estado</th>
                            <th className="py-1.5 font-medium">Mora</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedule.map(c => (
                            <tr key={c.number} className="border-t border-slate-100">
                              <td className="py-1.5 pr-3 text-slate-700">{c.number}</td>
                              <td className="py-1.5 pr-3 text-slate-900">{fmt(c.amount)}</td>
                              <td className="py-1.5 pr-3 text-slate-600">{fmtDate(c.dueDate)}</td>
                              <td className="py-1.5 pr-3">
                                <span className={`px-2 py-0.5 rounded-full font-medium ${
                                  c.status === 'PAID' ? 'bg-emerald-50 text-emerald-600'
                                    : c.status === 'OVERDUE' ? 'bg-orange-50 text-orange-600'
                                    : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {c.status === 'PAID' ? 'Pagada' : c.status === 'OVERDUE' ? 'En mora' : 'Pendiente'}
                                </span>
                              </td>
                              <td className="py-1.5 text-slate-600">{c.lateDays > 0 ? `${c.lateDays} días` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Exporta el cálculo para la página ───
export { computeRisk, computeFinancialSummary };
