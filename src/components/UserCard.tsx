import Link from 'next/link';
import { User } from '@/lib/types';

interface Props {
  user: User;
  subscriptionAmount?: number;
}

const formatCOP = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);

export function UserCard({ user, subscriptionAmount }: Props) {
  return (
    <Link href={`/usuarios/${user.id}`}>
      <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
            {(user.name?.[0] || user.email?.[0] || '?').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-900 font-semibold truncate">
              {user.name} {user.lastName}
            </p>
            <p className="text-slate-400 text-sm truncate">{user.email || user.phone}</p>
          </div>
          {user.isSubscribed ? (
            <div className="text-right">
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                Suscrito
              </span>
              <p className="text-blue-600 text-xs mt-1 font-medium">
                {formatCOP(subscriptionAmount && subscriptionAmount > 0 ? subscriptionAmount : 22000)}
              </p>
            </div>
          ) : (
            <span className="text-xs bg-slate-100 text-slate-400 px-2 py-1 rounded-full">
              No suscrito
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
