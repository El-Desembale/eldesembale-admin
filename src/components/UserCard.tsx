import Link from 'next/link';
import { User } from '@/lib/types';

interface Props {
  user: User;
}

export function UserCard({ user }: Props) {
  return (
    <Link href={`/usuarios/${user.id}`}>
      <div className="bg-[#0d1f0d] border border-[#2FFF00]/20 rounded-xl p-4 hover:border-[#2FFF00]/60 transition-all cursor-pointer">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#2FFF00]/20 flex items-center justify-center text-[#2FFF00] font-bold text-lg">
            {(user.name?.[0] || user.email?.[0] || '?').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold truncate">
              {user.name} {user.lastName}
            </p>
            <p className="text-gray-400 text-sm truncate">{user.email || user.phone}</p>
          </div>
          {user.isSubscribed && (
            <span className="text-xs bg-[#2FFF00]/20 text-[#2FFF00] px-2 py-1 rounded-full">
              Suscrito
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
