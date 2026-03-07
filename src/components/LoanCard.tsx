import Link from 'next/link';
import { LoanRequest } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  loan: LoanRequest;
}

export function LoanCard({ loan }: Props) {
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

  return (
    <Link href={`/solicitudes/${loan.id}`}>
      <div className="bg-[#0d1f0d] border border-[#2FFF00]/20 rounded-xl p-4 hover:border-[#2FFF00]/60 transition-all cursor-pointer">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-white font-semibold text-lg">{amount}</p>
            <p className="text-gray-400 text-sm">{loan.phone}</p>
          </div>
          <StatusBadge status={loan.status} />
        </div>
        <div className="flex gap-4 text-sm text-gray-400">
          <span>{loan.installments} cuotas</span>
          <span>{loan.interest}% interés</span>
          <span>{loan.paymentPeriod}</span>
        </div>
        <p className="text-gray-500 text-xs mt-2">{date}</p>
      </div>
    </Link>
  );
}
