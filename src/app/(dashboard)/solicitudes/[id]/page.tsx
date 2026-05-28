'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, query, collection, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { updateLoanStatus, deleteLoanRequest, getPaymentsByLoanId, getBudgetConfig, getLoans } from '@/lib/firestore';
import { LoanRequest, Payment } from '@/lib/types';
import { isInMora, getDaysOverdue } from '@/lib/mora';
import { StatusBadge } from '@/components/StatusBadge';
import { LoanDocumentsDialog } from '@/components/LoanDocumentsDialog';
import { ReminderDialog } from '@/components/ReminderDialog';
import { PaymentCard } from '@/components/PaymentCard';

const ACTION_STATUSES: { label: string; value: LoanRequest['status']; color: string }[] = [
  { label: 'Pendiente', value: 'pending', color: 'bg-[#b79d66]/14 text-[#8e7335] border-[#d8c394] hover:bg-[#b79d66]/20' },
  { label: 'Aprobar', value: 'approved', color: 'bg-[#7d8fa4]/14 text-[#57687d] border-[#b4c1cf] hover:bg-[#7d8fa4]/20' },
  { label: 'Rechazar', value: 'rejected', color: 'bg-[#9d6764]/14 text-[#744846] border-[#d8b0ad] hover:bg-[#9d6764]/20' },
  { label: 'Desembolsar', value: 'disbursed', color: 'bg-[#7d977d]/16 text-[#4f684f] border-[#bad0ba] hover:bg-[#7d977d]/22' },
];

const DOCUMENT_ITEMS = [
  { key: 'ccFrontalPicture', label: 'Cedula frontal', helper: 'Documento principal' },
  { key: 'ccBackPicture', label: 'Cedula respaldo', helper: 'Cara posterior del documento' },
  { key: 'selfiePicture', label: 'Selfie', helper: 'Validacion facial del solicitante' },
  { key: 'empInvoiceFile', label: 'Comprobante', helper: 'Factura o soporte laboral' },
] as const;

function parseLoanFromFirestore(id: string, data: Record<string, unknown>): LoanRequest {
  const createdAt = data.created_at instanceof Timestamp ? data.created_at.toDate() : new Date();
  const raw = (data.loan_information as Record<string, unknown>) || {};
  return {
    id,
    amount: (data.amount as number) || 0,
    createdAt,
    installments: (data.installments as number) || 0,
    interest: (data.interest as number) || 0,
    paymentPeriod: (data.payment_period as string) || '',
    status: (data.status as LoanRequest['status']) || 'pending',
    installmentsPaid: (data.installments_paid as number) || 0,
    phone: (data.phone as string) || '',
    isSubscribed: (data.isSubscribed as boolean) || false,
    loanInformation: {
      firstReference: (raw.first_reference as { phone: string; relationship: string }) || { phone: '', relationship: '' },
      secondReference: (raw.second_reference as { phone: string; relationship: string }) || { phone: '', relationship: '' },
      ccBackPicture: (raw.cc_back_picture as string) || '',
      selfiePicture: (raw.selfie_picture as string) || '',
      empInvoiceFile: (raw.emp_invoice_file as string) || '',
      ccFrontalPicture: (raw.cc_frontal_picture as string) || '',
      bankInformation: (raw.bank_information as Record<string, string>) || {},
      direction: (raw.direction as string) || '',
    },
  };
}

export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loan, setLoan] = useState<LoanRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDocs, setShowDocs] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clientInfo, setClientInfo] = useState<{ name: string; email?: string; isSubscribed?: boolean } | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [availableFunds, setAvailableFunds] = useState<number | null>(null);

  useEffect(() => {
    const fetchLoan = async () => {
      try {
        const loanDoc = await getDoc(doc(db, 'loan_request', id));
        if (!loanDoc.exists()) {
          router.replace('/');
          return;
        }
        const parsed = parseLoanFromFirestore(loanDoc.id, loanDoc.data() as Record<string, unknown>);
        setLoan(parsed);
        const loanPayments = await getPaymentsByLoanId(id);
        setPayments(loanPayments);
        if (parsed.phone) {
          const q = query(collection(db, 'users'), where('phone', '==', parsed.phone));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const u = snap.docs[0].data() as Record<string, unknown>;
            setClientInfo({
              name: [(u.name as string) || '', (u.lastName as string) || ''].filter(Boolean).join(' '),
              email: (u.email as string) || undefined,
              isSubscribed: (u.isSubscribed as boolean) || false,
            });
          }
        }
        const [budgetConfig, allLoans] = await Promise.all([getBudgetConfig(), getLoans()]);
        if (budgetConfig && budgetConfig.totalCapital > 0) {
          const approvedLoans = allLoans.filter(l => l.status === 'disbursed');
          const capitalLent = approvedLoans.reduce((sum, l) => sum + l.amount, 0);
          const capitalRecovered = approvedLoans.reduce((sum, l) => {
            if (l.installments <= 0) return sum;
            return sum + (l.installmentsPaid * (l.amount / l.installments));
          }, 0);
          setAvailableFunds(budgetConfig.totalCapital - capitalLent + capitalRecovered);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchLoan();
  }, [id, router]);

  const handleStatusChange = async (status: LoanRequest['status']) => {
    if (!loan || updating) return;
    setUpdating(true);
    try {
      await updateLoanStatus(loan.id, status);
      setLoan(prev => prev ? { ...prev, status } : prev);

      if (clientInfo?.email) {
        try {
          const res = await fetch('/api/notify-status-change', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: clientInfo.email,
              userName: clientInfo.name || '',
              phone: loan.phone,
              loanId: loan.id,
              amount: loan.amount,
              newStatus: status,
              installments: loan.installments,
              paymentPeriod: loan.paymentPeriod,
              interest: loan.interest,
              createdAt: loan.createdAt.toISOString(),
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            console.error('notify-status-change failed', res.status, data);
            alert(`No se pudo enviar el correo: ${data.error || res.statusText}`);
          }
        } catch (e) {
          console.error('notify-status-change error', e);
          alert('No se pudo enviar el correo (error de red).');
        }
      } else {
        alert('El cliente no tiene correo registrado, no se envió notificación.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!loan || deleting) return;
    if (!confirm('¿Eliminar esta solicitud? Esta acción no se puede deshacer.')) return;
    setDeleting(true);
    try {
      await deleteLoanRequest(loan.id);
      router.replace('/');
    } catch (e) {
      console.error(e);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!loan) return null;

  const amount = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(loan.amount);

  const date = loan.createdAt.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const bank = loan.loanInformation.bankInformation;
  const mora = isInMora(loan);
  const daysOverdue = getDaysOverdue(loan);
  const documents = DOCUMENT_ITEMS.map((item) => ({
    ...item,
    url: loan.loanInformation[item.key],
  }));

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="text-slate-500 hover:text-blue-600 transition-colors text-sm font-medium">
          ← Solicitudes
        </Link>
        <div className="flex items-center gap-2">
          {mora && (
            <button
              onClick={() => setShowReminder(true)}
              className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-100 transition-colors"
            >
              <span>📩</span> Enviar recordatorio
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-rose-100 transition-colors disabled:opacity-50"
          >
            {deleting ? 'Eliminando...' : 'Eliminar solicitud'}
          </button>
        </div>
      </div>

      {/* Mora banner */}
      {mora && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
          <div>
            <p className="text-orange-600 font-semibold text-sm">⚠ Préstamo en mora</p>
            <p className="text-orange-500/70 text-xs mt-0.5">{daysOverdue} días de atraso · {loan.installmentsPaid} de {loan.installments} cuotas pagadas</p>
          </div>
        </div>
      )}

      {/* Main info */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-4 shadow-sm">
        <div className="flex justify-between items-start mb-4">
          <div>
            {clientInfo?.name && (
              <p className="text-slate-900 font-semibold text-lg mb-1">{clientInfo.name}</p>
            )}
            <p className="text-blue-600 text-3xl font-bold">{amount}</p>
            <p className="text-slate-400 text-sm mt-1">{loan.phone}</p>
          </div>
          <StatusBadge status={loan.status} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-slate-400 text-xs">Cuotas</p>
            <p className="text-slate-900">{loan.installments}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">Cuotas pagadas</p>
            <p className="text-slate-900">{loan.installmentsPaid}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">Interés</p>
            <p className="text-slate-900">{loan.interest}%</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">Período</p>
            <p className="text-slate-900">{loan.paymentPeriod}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">Fecha solicitud</p>
            <p className="text-slate-900">{date}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">Suscrito</p>
            <p className="text-slate-900">{(clientInfo?.isSubscribed ?? loan.isSubscribed) ? 'Sí' : 'No'}</p>
          </div>
        </div>

        {/* Installment dates inside main card */}
        {loan.installments > 0 && (() => {
          const base = loan.createdAt instanceof Date ? loan.createdAt : new Date(loan.createdAt);
          const installmentAmount = ((loan.amount * loan.interest) - loan.amount + (loan.amount / loan.installments));
          const isActive = loan.status === 'disbursed';
          return (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-slate-400 text-xs mb-2">Fechas de pago</p>
              <div className="grid gap-1.5">
                {Array.from({ length: loan.installments }, (_, i) => {
                  let dueDate: Date;
                  if (loan.paymentPeriod === 'Mensual') {
                    dueDate = new Date(base.getFullYear(), base.getMonth() + 1 + i, base.getDate());
                  } else {
                    const first = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
                    dueDate = new Date(first.getTime() + 15 * i * 24 * 60 * 60 * 1000);
                  }
                  const paid = isActive && i < loan.installmentsPaid;
                  const isNext = isActive && i === loan.installmentsPaid;
                  return (
                    <div key={i} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm border ${
                      paid ? 'bg-green-50 border-green-100' : isNext ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100'
                    }`}>
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <span className={paid ? 'text-green-500' : isNext ? 'text-blue-400' : 'text-slate-300'}>
                            {paid ? '✓' : isNext ? '▶' : '○'}
                          </span>
                        )}
                        <span className={paid ? 'text-slate-400' : 'text-slate-700'}>Cuota {i + 1}</span>
                        {isNext && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">Siguiente</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">
                          {dueDate.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        <span className={`font-medium text-xs ${paid ? 'text-slate-400' : isNext ? 'text-blue-600' : 'text-slate-700'}`}>
                          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(installmentAmount)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Bank info */}
      {Object.keys(bank).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4 shadow-sm">
          <h2 className="text-slate-900 font-semibold mb-3">Información bancaria</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(bank).map(([key, val]) => (
              <div key={key}>
                <p className="text-slate-400 text-xs capitalize">{key.replace(/_/g, ' ')}</p>
                <p className="text-slate-900">{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* References */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4 shadow-sm">
        <h2 className="text-slate-900 font-semibold mb-3">Referencias</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-400 text-xs mb-1">Referencia 1</p>
            <p className="text-slate-900">{loan.loanInformation.firstReference.phone || '—'}</p>
            <p className="text-slate-500">{loan.loanInformation.firstReference.relationship || '—'}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">Referencia 2</p>
            <p className="text-slate-900">{loan.loanInformation.secondReference.phone || '—'}</p>
            <p className="text-slate-500">{loan.loanInformation.secondReference.relationship || '—'}</p>
          </div>
        </div>
        {loan.loanInformation.direction && (
          <div className="mt-3">
            <p className="text-slate-400 text-xs">Dirección</p>
            <p className="text-slate-900 text-sm">{loan.loanInformation.direction}</p>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-slate-900 font-semibold">Documentos del solicitante</h2>
            <p className="text-slate-400 text-xs mt-1">
              Revisa los soportes cargados antes de cambiar el estado de la solicitud.
            </p>
          </div>
          <button
            onClick={() => setShowDocs(true)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#7d977d] hover:bg-[#7d977d]/10"
          >
            Abrir visor
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {documents.map((document) => {
            const available = Boolean(document.url);
            return (
              <div
                key={document.key}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{document.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{document.helper}</p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      available
                        ? 'bg-[#7d977d]/14 text-[#537053]'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {available ? 'Cargado' : 'Pendiente'}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {available ? (
                    <>
                      <a
                        href={document.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-[#7d977d] hover:bg-[#7d977d]/10"
                      >
                        Ver archivo
                      </a>
                      <button
                        onClick={() => setShowDocs(true)}
                        className="inline-flex items-center rounded-xl px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-200"
                      >
                        Ver en visor
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">
                      El cliente no subio este soporte en la solicitud.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment history */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4 shadow-sm">
        <h2 className="text-slate-900 font-semibold mb-3">Historial de pagos ({payments.length})</h2>
        {payments.length === 0 ? (
          <p className="text-slate-400 text-sm">Sin pagos registrados</p>
        ) : (
          <div className="grid gap-3">
            {payments.map(payment => (
              <PaymentCard key={payment.id} payment={payment} />
            ))}
          </div>
        )}
      </div>

      {/* Insufficient funds warning */}
      {availableFunds !== null && availableFunds < loan.amount && loan.status !== 'disbursed' && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-red-600 font-semibold text-sm">Fondos insuficientes</p>
          <p className="text-red-500/70 text-xs mt-0.5">
            Disponible: {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(availableFunds)} — Este préstamo requiere: {amount}
          </p>
        </div>
      )}

      {/* Status actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-slate-900 font-semibold mb-3">Cambiar estado</h2>
        <div className="flex flex-wrap gap-2">
          {ACTION_STATUSES.map(action => {
            const insufficientFunds = action.value === 'disbursed' && availableFunds !== null && availableFunds < loan.amount;
            return (
              <button
                key={action.value}
                onClick={() => handleStatusChange(action.value)}
                disabled={updating || loan.status === action.value || insufficientFunds}
                title={insufficientFunds ? 'Fondos insuficientes para aprobar este préstamo' : undefined}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all disabled:opacity-40 ${action.color} ${
                  loan.status === action.value ? 'ring-2 ring-blue-300' : ''
                }`}
              >
                {loan.status === action.value && '✓ '}{action.label}
              </button>
            );
          })}
        </div>
      </div>

      {showDocs && (
        <LoanDocumentsDialog
          loanInfo={loan.loanInformation}
          onClose={() => setShowDocs(false)}
        />
      )}

      {showReminder && (
        <ReminderDialog
          email={clientInfo?.email || ''}
          userName={clientInfo?.name || loan.phone}
          daysOverdue={daysOverdue}
          onClose={() => setShowReminder(false)}
        />
      )}
    </div>
  );
}
