import { LoanRequest, Payment } from './types';
import { isInMora, getExpectedInstallments, getDaysOverdue } from './mora';

// ─── Perfiles de riesgo y cupos ───
export type RiskProfile = 'NEW' | 'GOOD_PAYER' | 'MEDIUM_RISK' | 'BLOCKED';

export const NEW_MAX_AMOUNT = 200_000;
export const GOOD_PAYER_MAX_AMOUNT = 500_000;

export const RISK_LABELS: Record<RiskProfile, string> = {
  NEW: 'Cliente nuevo',
  GOOD_PAYER: 'Buen pagador',
  MEDIUM_RISK: 'Riesgo medio',
  BLOCKED: 'Bloqueado',
};

export const RISK_COLORS: Record<RiskProfile, string> = {
  NEW: '#60a5fa',
  GOOD_PAYER: '#22c55e',
  MEDIUM_RISK: '#f59e0b',
  BLOCKED: '#f87171',
};

// ─── Cálculo de montos por cuota (mismo formula que app móvil / notify-new-loan) ───
export function installmentAmount(loan: LoanRequest): number {
  if (loan.installments <= 0) return 0;
  if (loan.interest && loan.interest > 0) {
    return Math.round((loan.amount * loan.interest) - loan.amount + (loan.amount / loan.installments));
  }
  return Math.round(loan.amount / loan.installments);
}

export function totalRepayable(loan: LoanRequest): number {
  return installmentAmount(loan) * loan.installments;
}

// ─── Cronograma de cuotas derivado ───
export interface Installment {
  number: number;
  amount: number;
  dueDate: Date;
  status: 'PAID' | 'OVERDUE' | 'PENDING';
  lateDays: number;
}

function calcInstallmentDate(base: Date, index: number, paymentPeriod: string): Date {
  if (paymentPeriod === 'Mensual') {
    return new Date(base.getFullYear(), base.getMonth() + 1 + index, base.getDate());
  }
  const first = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
  return new Date(first.getTime() + 15 * index * 24 * 60 * 60 * 1000);
}

export function getInstallmentSchedule(loan: LoanRequest): Installment[] {
  const perAmount = installmentAmount(loan);
  const expected = getExpectedInstallments(loan);
  const out: Installment[] = [];
  for (let i = 0; i < loan.installments; i++) {
    const paid = i < loan.installmentsPaid;
    // En mora: cuota esperada (vencida) que aún no se ha pagado y el préstamo está desembolsado
    const overdue = !paid && loan.status === 'disbursed' && i < expected;
    out.push({
      number: i + 1,
      amount: perAmount,
      dueDate: calcInstallmentDate(loan.createdAt, i, loan.paymentPeriod),
      status: paid ? 'PAID' : overdue ? 'OVERDUE' : 'PENDING',
      lateDays: overdue ? getDaysOverdue(loan) : 0,
    });
  }
  return out;
}

// ─── Resumen financiero ───
export interface FinancialSummary {
  totalRequested: number;        // # solicitudes
  totalApproved: number;         // # aprobadas/desembolsadas
  totalRejected: number;         // # rechazadas
  totalDisbursedAmount: number;  // $ desembolsado (capital)
  totalToRepay: number;          // $ total a pagar (capital + interés) de préstamos activos
  totalPaid: number;             // $ pagado (cuotas aprobadas)
  pendingBalance: number;        // $ saldo pendiente
  accruedLateAmount: number;     // $ mora acumulada (cuotas vencidas sin pagar)
  paidInstallments: number;
  pendingInstallments: number;
  lateInstallments: number;
  lastPaymentDate: Date | null;
  lastLoanDate: Date | null;
}

export function computeFinancialSummary(loans: LoanRequest[], payments: Payment[]): FinancialSummary {
  const disbursed = loans.filter(l => l.status === 'disbursed');
  const approvedOrDisbursed = loans.filter(l => l.status === 'approved' || l.status === 'disbursed');
  const rejected = loans.filter(l => l.status === 'rejected');

  let totalToRepay = 0;
  let totalPaidFromInstallments = 0;
  let pendingBalance = 0;
  let accruedLateAmount = 0;
  let paidInstallments = 0;
  let pendingInstallments = 0;
  let lateInstallments = 0;

  for (const loan of approvedOrDisbursed) {
    const per = installmentAmount(loan);
    const total = per * loan.installments;
    totalToRepay += total;
    paidInstallments += Math.min(loan.installmentsPaid, loan.installments);
    const remaining = Math.max(loan.installments - loan.installmentsPaid, 0);
    pendingInstallments += remaining;
    pendingBalance += remaining * per;
    if (isInMora(loan)) {
      const late = Math.max(getExpectedInstallments(loan) - loan.installmentsPaid, 0);
      lateInstallments += late;
      accruedLateAmount += late * per;
    }
  }

  // Pagos de cuotas aprobados
  const installmentPayments = payments.filter(p => p.type === 'installment' && p.status === 'APPROVED');
  for (const p of installmentPayments) totalPaidFromInstallments += p.amount;

  const sortedPayments = [...installmentPayments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const sortedLoans = [...loans].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    totalRequested: loans.length,
    totalApproved: approvedOrDisbursed.length,
    totalRejected: rejected.length,
    totalDisbursedAmount: disbursed.reduce((s, l) => s + l.amount, 0),
    totalToRepay,
    totalPaid: totalPaidFromInstallments,
    pendingBalance,
    accruedLateAmount,
    paidInstallments,
    pendingInstallments,
    lateInstallments,
    lastPaymentDate: sortedPayments[0]?.createdAt ?? null,
    lastLoanDate: sortedLoans[0]?.createdAt ?? null,
  };
}

// ─── Perfil de riesgo ───
export interface RiskAssessment {
  profile: RiskProfile;
  maxLoanAmount: number;
  isBlockedForNewLoans: boolean;
  hasHadLatePayments: boolean;
  hasSevereLatePayments: boolean;
  totalLoans: number;
  paidLoans: number;
  activeLoans: number;
  currentLateInstallments: number;
  reason: string;
}

/**
 * Calcula el perfil de riesgo a partir del historial de préstamos.
 * - Un préstamo "pagado" = installmentsPaid >= installments (>0).
 * - Mora actual: derivada de mora.ts. Mora histórica curada: campo opcional `hadMora` en el loan.
 * - previousMax: cupo previo del usuario (para que MEDIUM_RISK conserve cupo).
 */
export function computeRisk(loans: LoanRequest[], previousMax?: number): RiskAssessment {
  const paid = loans.filter(l => l.installments > 0 && l.installmentsPaid >= l.installments);
  const active = loans.filter(l => l.status === 'disbursed' && l.installmentsPaid < l.installments);
  const loansInMora = loans.filter(isInMora);

  // Mora histórica (curada) si el loan trae el flag opcional `hadMora`
  type LoanWithFlags = LoanRequest & { hadMora?: boolean; maxLateInstallments?: number };
  const hadMoraEver = loansInMora.length > 0 ||
    loans.some(l => (l as LoanWithFlags).hadMora === true);

  const currentLateInstallments = loansInMora.reduce(
    (s, l) => s + Math.max(getExpectedInstallments(l) - l.installmentsPaid, 0), 0,
  );

  // Mora grave: más de una cuota en mora, o más de un préstamo en mora, o historial grave
  const severeMora =
    currentLateInstallments > 1 ||
    loansInMora.length > 1 ||
    loans.some(l => ((l as LoanWithFlags).maxLateInstallments ?? 0) > 1);

  // Buen pagador: pagó completo al menos un préstamo que nunca tuvo mora
  const paidWithoutMora = paid.some(l => (l as LoanWithFlags).hadMora !== true);

  let profile: RiskProfile;
  let maxLoanAmount: number;
  let isBlockedForNewLoans = false;
  let reason: string;

  if (severeMora) {
    profile = 'BLOCKED';
    maxLoanAmount = 0;
    isBlockedForNewLoans = true;
    reason = 'El usuario presenta mora grave (más de una cuota en mora).';
  } else if (hadMoraEver) {
    profile = 'MEDIUM_RISK';
    // Conserva el cupo anterior; no sube automáticamente a 500k
    maxLoanAmount = Math.max(previousMax ?? NEW_MAX_AMOUNT, NEW_MAX_AMOUNT);
    if (maxLoanAmount > GOOD_PAYER_MAX_AMOUNT) maxLoanAmount = GOOD_PAYER_MAX_AMOUNT;
    reason = 'El usuario ha presentado mora; no aplica para aumento de cupo automático.';
  } else if (paidWithoutMora) {
    profile = 'GOOD_PAYER';
    maxLoanAmount = GOOD_PAYER_MAX_AMOUNT;
    reason = 'Pagó al menos un crédito completo sin mora.';
  } else {
    profile = 'NEW';
    maxLoanAmount = NEW_MAX_AMOUNT;
    reason = 'Cliente nuevo o sin créditos pagados completamente.';
  }

  return {
    profile,
    maxLoanAmount,
    isBlockedForNewLoans,
    hasHadLatePayments: hadMoraEver,
    hasSevereLatePayments: severeMora,
    totalLoans: loans.length,
    paidLoans: paid.length,
    activeLoans: active.length,
    currentLateInstallments,
    reason,
  };
}
