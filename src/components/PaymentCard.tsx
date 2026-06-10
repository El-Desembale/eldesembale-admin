import { Payment, PAYMENT_TYPE_LABELS } from '@/lib/types';
import { PaymentStatusBadge } from './PaymentStatusBadge';

interface Props {
  payment: Payment;
}

export function PaymentCard({ payment }: Props) {
  const date = payment.createdAt.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const fmt = (n: number) => new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);

  const typeLabel = PAYMENT_TYPE_LABELS[payment.type] || payment.type;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-all shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-slate-900 font-semibold text-lg">{fmt(payment.grossAmount)}</p>
          <p className="text-slate-400 text-xs">
            Wompi {fmt(payment.wompiFee)} · Neto <span className="text-emerald-600 font-medium">{fmt(payment.netAmount)}</span>
          </p>
          <p className="text-slate-400 text-sm">{payment.userName || payment.userPhone}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <PaymentStatusBadge status={payment.status} />
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
            {typeLabel}
          </span>
        </div>
      </div>
      <div className="flex gap-4 text-sm text-slate-400 flex-wrap">
        <span>{payment.userPhone}</span>
        {payment.installmentNumber && (
          <span>Cuota #{payment.installmentNumber}</span>
        )}
        <span>{payment.reference}</span>
      </div>
      <p className="text-slate-400 text-xs mt-2">{date}</p>
    </div>
  );
}
