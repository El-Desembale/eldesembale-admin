import { Payment, PAYMENT_TYPE_LABELS } from '@/lib/types';
import { PaymentStatusBadge } from './PaymentStatusBadge';

interface Props {
  payment: Payment;
  onApprove?: (payment: Payment) => Promise<void> | void;
  onReject?: (paymentId: string) => Promise<void> | void;
  busy?: boolean;
}

export function PaymentCard({ payment, onApprove, onReject, busy = false }: Props) {
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
  const sourceLabel = payment.source === 'manual' ? 'Comprobante manual' : 'Wompi';
  const canReview = payment.source === 'manual' && payment.status === 'PENDING_REVIEW';

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
          <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {sourceLabel}
          </span>
        </div>
      </div>
      <div className="flex gap-4 text-sm text-slate-400 flex-wrap">
        <span>{payment.userPhone}</span>
        {payment.installmentNumber && (
          <span>Cuota #{payment.installmentNumber}</span>
        )}
        {payment.installmentsToPay > 1 && (
          <span>{payment.installmentsToPay} cuotas reportadas</span>
        )}
        <span>{payment.reference}</span>
      </div>
      {payment.proofUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={payment.proofUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Ver comprobante
          </a>
          {payment.proofName && (
            <span className="text-xs text-slate-400">{payment.proofName}</span>
          )}
        </div>
      )}
      {canReview && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onApprove?.(payment)}
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? 'Procesando...' : 'Aprobar'}
          </button>
          <button
            onClick={() => onReject?.(payment.id)}
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 text-sm font-medium hover:bg-rose-100 disabled:opacity-60"
          >
            Rechazar
          </button>
        </div>
      )}
      <p className="text-slate-400 text-xs mt-2">{date}</p>
    </div>
  );
}
