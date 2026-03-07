'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUserLoans } from '@/lib/firestore';
import { User, LoanRequest } from '@/lib/types';
import { LoanCard } from '@/components/LoanCard';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', id));
        if (!userDoc.exists()) {
          router.replace('/usuarios');
          return;
        }
        const data = userDoc.data() as Record<string, unknown>;
        const userData: User = {
          id: userDoc.id,
          email: (data.email as string) || '',
          phone: (data.phone as string) || '',
          name: (data.name as string) || '',
          lastName: (data.lastName as string) || '',
          isSubscribed: (data.isSubscribed as boolean) || false,
          admin: (data.admin as boolean) || false,
        };
        setUser(userData);

        if (userData.phone) {
          const userLoans = await getUserLoans(userData.phone);
          setLoans(userLoans);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-[#2FFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/usuarios" className="text-gray-400 hover:text-[#2FFF00] transition-colors">
          ← Usuarios
        </Link>
      </div>

      {/* User info */}
      <div className="bg-[#0d1f0d] border border-[#2FFF00]/20 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-[#2FFF00]/20 flex items-center justify-center text-[#2FFF00] font-bold text-2xl">
            {(user.name?.[0] || user.email?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">{user.name} {user.lastName}</h1>
            <div className="flex gap-2 mt-1">
              {user.isSubscribed && (
                <span className="text-xs bg-[#2FFF00]/20 text-[#2FFF00] px-2 py-0.5 rounded-full">Suscrito</span>
              )}
              {user.admin && (
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Admin</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {user.email && (
            <div>
              <p className="text-gray-500 text-xs">Email</p>
              <p className="text-white text-sm">{user.email}</p>
            </div>
          )}
          {user.phone && (
            <div>
              <p className="text-gray-500 text-xs">Teléfono</p>
              <p className="text-white text-sm">{user.phone}</p>
            </div>
          )}
        </div>
      </div>

      {/* User loans */}
      <h2 className="text-white font-bold text-lg mb-3">
        Solicitudes ({loans.length})
      </h2>
      {loans.length === 0 ? (
        <p className="text-gray-500">Sin solicitudes</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {loans.map(loan => (
            <LoanCard key={loan.id} loan={loan} />
          ))}
        </div>
      )}
    </div>
  );
}
