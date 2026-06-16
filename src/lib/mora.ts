import { LoanRequest } from './types';
import { installmentDueDate, type PaymentPeriod } from './loan-calc';

/**
 * Fecha base del cronograma: el desembolso (no la creación de la solicitud), para
 * no contar como mora los días que la solicitud estuvo en revisión antes de desembolsar.
 */
function scheduleBase(loan: LoanRequest): Date {
  return loan.disbursedAt ?? loan.createdAt;
}

/**
 * Fecha de vencimiento de la cuota `index` (0-based), calculada desde el desembolso.
 * No se usan las fechas persistidas del desglose porque se calcularon al CREAR la
 * solicitud (base = createdAt), antes del desembolso real; usarlas marcaría mora
 * por los días que la solicitud estuvo en revisión.
 */
function dueDateOf(loan: LoanRequest, index: number): Date {
  return installmentDueDate(scheduleBase(loan), index, loan.paymentPeriod as PaymentPeriod);
}

/** Cuántas cuotas ya vencieron a la fecha (las que deberían estar pagadas hoy). */
export function getExpectedInstallments(loan: LoanRequest): number {
  const now = Date.now();
  let expected = 0;
  for (let i = 0; i < loan.installments; i++) {
    if (dueDateOf(loan, i).getTime() <= now) expected++;
    else break; // los vencimientos van en orden ascendente
  }
  return expected;
}

export function isInMora(loan: LoanRequest): boolean {
  if (loan.status !== 'disbursed') return false;
  if (loan.installmentsPaid >= loan.installments) return false;
  return getExpectedInstallments(loan) > loan.installmentsPaid;
}

export function getDaysOverdue(loan: LoanRequest): number {
  if (!isInMora(loan)) return 0;
  // Días transcurridos desde el vencimiento de la primera cuota impaga.
  const firstUnpaidDue = dueDateOf(loan, loan.installmentsPaid);
  return Math.max(
    0,
    Math.floor((Date.now() - firstUnpaidDue.getTime()) / (1000 * 60 * 60 * 24))
  );
}
