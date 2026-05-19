import Link from 'next/link';
import { LoanRequest } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  loan: LoanRequest;
  userName?: string;
  inMora?: boolean;
}

function getNextInstallmentDate(loan: LoanRequest): Date | null {
  if (loan.status !== 'approved' || loan.installmentsPaid >= loan.installments) return null;
  const base = new Date(loan.createdAt);
  const i = loan.installmentsPaid;
  if (loan.paymentPeriod === 'Mensual') {
    return new Date(base.getFullYear(), base.getMonth() + 1 + i, base.getDate());
  }
  const first = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
  return new Date(first.getTime() + 15 * i * 24 * 60 * 60 * 1000);
}

export function LoanCard({ loan, userName, inMora }: Props) {
  const date = loan.createdAt.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const amount = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(loan.amount);

  const nextDate = getNextInstallmentDate(loan);
  const installmentAmount = loan.installments > 0
    ? ((loan.amount * loan.interest) - loan.amount + (loan.amount / loan.installments))
    : 0;
  const installmentAmountFmt = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(installmentAmount);

  return (
    <Link href={`/solicitudes/${loan.id}`}>
      <div className={`bg-white rounded-xl p-4 transition-all cursor-pointer border shadow-sm ${
        inMora
          ? 'border-orange-300 hover:border-orange-400'
          : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
      }`}>
        {inMora && (
          <div className="flex items-center gap-1.5 text-orange-500 text-xs font-medium mb-2">
            <span>⚠</span><span>En mora</span>
          </div>
        )}
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-slate-900 font-semibold text-lg">{amount}</p>
            {userName && <p className="text-slate-700 text-sm font-medium">{userName}</p>}
            <p className="text-slate-400 text-sm">{loan.phone}</p>
          </div>
          <StatusBadge status={loan.status} />
        </div>
        <div className="flex gap-4 text-sm text-slate-500">
          <span>{loan.installmentsPaid}/{loan.installments} cuotas</span>
          <span>{loan.interest}% interés</span>
          <span>{loan.paymentPeriod}</span>
        </div>
        {nextDate && (
          <div className="mt-2 flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5">
            <span className="text-blue-500 text-xs font-medium">Próxima cuota</span>
            <div className="text-right">
              <p className="text-blue-700 text-xs font-semibold">
                {nextDate.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
              <p className="text-blue-600 text-xs">{installmentAmountFmt}</p>
            </div>
          </div>
        )}
        {loan.status === 'approved' && loan.installmentsPaid >= loan.installments && (
          <div className="mt-2 bg-green-50 border border-green-100 rounded-lg px-2.5 py-1.5 text-center">
            <span className="text-green-600 text-xs font-semibold">✓ Pagado completamente</span>
          </div>
        )}
        <p className="text-slate-400 text-xs mt-2">{date}</p>
      </div>
    </Link>
  );
}
