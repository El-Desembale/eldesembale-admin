'use client';

import { useState, useEffect } from 'react';
import { approveManualPayment, getPayments, rejectManualPayment } from '@/lib/firestore';
import { Payment } from '@/lib/types';

export function usePayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const data = await getPayments();
      setPayments(data);
    } catch (e) {
      setError('Error cargando pagos');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const approve = async (payment: Payment) => {
    await approveManualPayment(payment);
    await fetchPayments();
  };

  const reject = async (paymentId: string) => {
    await rejectManualPayment(paymentId);
    await fetchPayments();
  };

  return { payments, loading, error, refetch: fetchPayments, approve, reject };
}
