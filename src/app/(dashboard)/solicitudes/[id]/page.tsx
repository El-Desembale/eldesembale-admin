'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, query, collection, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { updateLoanStatus, disburseLoan, rejectLoan, deleteLoanRequest, getPaymentsByLoanId, getBudgetConfig, getLoans } from '@/lib/firestore';
import { LoanRequest, Payment } from '@/lib/types';
import { isInMora, getDaysOverdue } from '@/lib/mora';
import { StatusBadge } from '@/components/StatusBadge';
import { LoanDocumentsDialog } from '@/components/LoanDocumentsDialog';
import { ReminderDialog } from '@/components/ReminderDialog';
import { DisbursementDialog } from '@/components/DisbursementDialog';
import { PaymentCard } from '@/components/PaymentCard';

const ACTION_STATUSES: { label: string; value: LoanRequest['status']; color: string }[] = [
  { label: 'Pendiente',    value: 'pending',   color: 'bg-[#b79d66]/14 text-[#8e7335] border-[#d8c394] hover:bg-[#b79d66]/20' },
  { label: 'En revisión',  value: 'reviewing', color: 'bg-[#7c6fad]/14 text-[#5b4e8e] border-[#c4bce8] hover:bg-[#7c6fad]/20' },
  { label: 'Aprobar',      value: 'approved',  color: 'bg-[#7d8fa4]/14 text-[#57687d] border-[#b4c1cf] hover:bg-[#7d8fa4]/20' },
  { label: 'Rechazar',     value: 'rejected',  color: 'bg-[#9d6764]/14 text-[#744846] border-[#d8b0ad] hover:bg-[#9d6764]/20' },
  { label: 'Desembolsar',  value: 'disbursed', color: 'bg-[#7d977d]/16 text-[#4f684f] border-[#bad0ba] hover:bg-[#7d977d]/22' },
];

const PRESET_REJECTION_REASONS = [
  'Los documentos cargados no coinciden con la información suministrada.',
  'La solicitud no cumple con las políticas internas de aprobación.',
  'No fue posible validar la identidad del solicitante.',
  'La información financiera suministrada está incompleta o inconsistente.',
  'El historial de pago o el perfil de riesgo no permite aprobar la solicitud.',
] as const;

const DOCUMENT_ITEMS = [
  { key: 'ccFrontalPicture', label: 'Cedula frontal', helper: 'Documento principal' },
  { key: 'ccBackPicture', label: 'Cedula respaldo', helper: 'Cara posterior del documento' },
  { key: 'selfiePicture', label: 'Selfie', helper: 'Validacion facial del solicitante' },
  { key: 'empInvoiceFile', label: 'Comprobante', helper: 'Factura o soporte laboral' },
] as const;

const BANK_FIELD_LABELS: Record<string, string> = {
  bank_name: 'Nombre del banco',
  bank_document_number: 'Número de documento',
  bank_account_number: 'Número de cuenta',
  bank_account_name: 'Nombre del titular',
  account_type: 'Tipo de cuenta',
  bank_document_type: 'Tipo de documento',
  bank_account_last_name: 'Apellido del titular',
  'bank name': 'Nombre del banco',
  'bank document number': 'Número de documento',
  'bank account number': 'Número de cuenta',
  'bank account name': 'Nombre del titular',
  'account type': 'Tipo de cuenta',
  'bank document type': 'Tipo de documento',
  'bank account last name': 'Apellido del titular',
  bankName: 'Nombre del banco',
  bankDocumentNumber: 'Número de documento',
  bankAccountNumber: 'Número de cuenta',
  bankAccountName: 'Nombre del titular',
  accountType: 'Tipo de cuenta',
  bankDocumentType: 'Tipo de documento',
  bankAccountLastName: 'Apellido del titular',
};

function getBankFieldLabel(key: string) {
  const normalizedKey = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (BANK_FIELD_LABELS[key]) return BANK_FIELD_LABELS[key];
  if (BANK_FIELD_LABELS[normalizedKey]) return BANK_FIELD_LABELS[normalizedKey];

  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

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
  const [showDisbursement, setShowDisbursement] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [selectedRejectReason, setSelectedRejectReason] = useState<string>(PRESET_REJECTION_REASONS[0]);
  const [rejectReason, setRejectReason] = useState('');
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

  const isCustomRejectReason = selectedRejectReason === 'custom';
  const finalRejectReason = isCustomRejectReason ? rejectReason.trim() : selectedRejectReason.trim();

  const resetRejectForm = () => {
    setShowReject(false);
    setSelectedRejectReason(PRESET_REJECTION_REASONS[0]);
    setRejectReason('');
  };

  const handleStatusChange = async (status: LoanRequest['status'], proofUrl?: string, reason?: string) => {
    if (!loan || updating) return;
    // Desembolsar requiere comprobante: abre el modal
    if (status === 'disbursed' && !proofUrl) {
      setShowDisbursement(true);
      return;
    }
    // Rechazar requiere motivo: abre el modal
    if (status === 'rejected' && !reason) {
      setShowReject(true);
      return;
    }
    setUpdating(true);
    try {
      if (status === 'disbursed' && proofUrl) {
        await disburseLoan(loan.id, proofUrl);
      } else if (status === 'rejected' && reason) {
        await rejectLoan(loan.id, reason);
      } else {
        await updateLoanStatus(loan.id, status);
      }
      setLoan(prev => prev ? { ...prev, status, rejectionReason: status === 'rejected' ? reason : prev.rejectionReason } : prev);

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
              proofUrl: proofUrl || undefined,
              rejectionReason: reason || undefined,
              // Desglose persistido (modelo nuevo): el correo usa estos montos/fechas si existen.
              installmentRows: loan.pricing
                ? loan.pricing.installments.map((c) => ({
                    amount: c.totalCliente,
                    dueDate: (c.fechaVencimiento instanceof Date
                      ? c.fechaVencimiento
                      : new Date(c.fechaVencimiento)).toISOString(),
                  }))
                : undefined,
              totalCliente: loan.pricing ? loan.pricing.totalCliente : undefined,
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
      setShowDisbursement(false);
      if (status === 'rejected') {
        resetRejectForm();
      } else {
        setShowReject(false);
      }
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

        {/* Motivo de rechazo */}
        {loan.status === 'rejected' && loan.rejectionReason && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-rose-700 text-xs font-semibold mb-1">Motivo del rechazo</p>
            <p className="text-rose-600 text-sm">{loan.rejectionReason}</p>
          </div>
        )}

        {/* Resumen operativo (modelo nuevo): costos del crédito vs comisión Wompi */}
        {loan.pricing && (() => {
          const p = loan.pricing!;
          const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
          const costos = p.interesTotal + p.plataformaTotal + p.administrativoTotal;
          return (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-slate-400 text-xs mb-2">Resumen del crédito</p>
              <div className="grid gap-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Capital</span><span className="text-slate-900 font-medium">{fmt(p.capital)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Intereses (interés + plataforma + admin.)</span><span className="text-slate-900 font-medium">{fmt(costos)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Total comisiones Wompi</span><span className="text-red-500 font-medium">{fmt(p.wompiTotal)}</span></div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5"><span className="text-slate-700 font-semibold">Total cobrado al cliente</span><span className="text-slate-900 font-bold">{fmt(p.totalCliente)}</span></div>
                <div className="flex justify-between"><span className="text-slate-700 font-semibold">Ganancia neta del préstamo</span><span className="text-emerald-600 font-bold">{fmt(p.totalCliente - p.capital - p.wompiTotal)}</span></div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5"><p className="text-[10px] uppercase tracking-wide">Interés</p><p className="text-slate-800 font-medium">{fmt(p.interesTotal)}</p></div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5"><p className="text-[10px] uppercase tracking-wide">Plataforma</p><p className="text-slate-800 font-medium">{fmt(p.plataformaTotal)}</p></div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5"><p className="text-[10px] uppercase tracking-wide">Administrativo</p><p className="text-slate-800 font-medium">{fmt(p.administrativoTotal)}</p></div>
              </div>
            </div>
          );
        })()}

        {/* Installment dates inside main card */}
        {loan.installments > 0 && (() => {
          const base = loan.createdAt instanceof Date ? loan.createdAt : new Date(loan.createdAt);
          const isActive = loan.status === 'disbursed';
          // Modelo nuevo: usar el desglose persistido; si no existe (créditos antiguos), fallback al cálculo previo.
          const legacyAmount = ((loan.amount * loan.interest) - loan.amount + (loan.amount / loan.installments));
          return (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-slate-400 text-xs mb-2">Fechas de pago</p>
              <div className="grid gap-1.5">
                {Array.from({ length: loan.installments }, (_, i) => {
                  const cuota = loan.pricing?.installments[i];
                  let dueDate: Date;
                  if (cuota) {
                    dueDate = cuota.fechaVencimiento instanceof Date ? cuota.fechaVencimiento : new Date(cuota.fechaVencimiento);
                  } else if (loan.paymentPeriod === 'Mensual') {
                    dueDate = new Date(base.getFullYear(), base.getMonth() + 1 + i, base.getDate());
                  } else {
                    const first = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
                    dueDate = new Date(first.getTime() + 15 * i * 24 * 60 * 60 * 1000);
                  }
                  const installmentAmount = cuota ? cuota.totalCliente : legacyAmount;
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
                <p className="text-slate-400 text-xs">{getBankFieldLabel(key)}</p>
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

      {showDisbursement && (
        <DisbursementDialog
          loanId={loan.id}
          amount={loan.amount}
          userName={clientInfo?.name || loan.phone}
          email={clientInfo?.email || ''}
          onConfirm={(proofUrl) => handleStatusChange('disbursed', proofUrl)}
          onClose={() => setShowDisbursement(false)}
        />
      )}

      {/* Modal de motivo de rechazo */}
      {showReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg flex flex-col gap-4 p-6 shadow-xl">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-2xl">❌</span>
                <h2 className="text-slate-900 font-bold text-lg">Rechazar solicitud</h2>
              </div>
              <button onClick={resetRejectForm} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <p className="text-slate-500 text-sm">Selecciona un motivo frecuente o redacta uno personalizado. Este mensaje se le enviará y mostrará al cliente.</p>
            <div className="grid gap-2">
              {PRESET_REJECTION_REASONS.map((reason) => {
                const selected = selectedRejectReason === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelectedRejectReason(reason)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                      selected
                        ? 'border-rose-300 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {reason}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedRejectReason('custom')}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  isCustomRejectReason
                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                }`}
              >
                Otro motivo
              </button>
            </div>
            {isCustomRejectReason && (
              <>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={4}
                  maxLength={400}
                  placeholder="Ej: Los documentos no coinciden con los datos suministrados."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 transition-colors resize-none"
                />
                <p className="text-slate-400 text-xs -mt-2">{rejectReason.length}/400</p>
              </>
            )}
            <div className="flex gap-3">
              <button
                onClick={resetRejectForm}
                disabled={updating}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleStatusChange('rejected', undefined, finalRejectReason)}
                disabled={updating || finalRejectReason.length < 5}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updating ? 'Rechazando...' : 'Rechazar y notificar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
