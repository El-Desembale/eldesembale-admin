'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUserLoans, getPaymentsByPhone, getUserPassword, updateUserPassword, updateUserSubscription, deleteUser, saveUserRisk } from '@/lib/firestore';
import { User, UserDocuments, LoanRequest, Payment, WorkReference } from '@/lib/types';
import { LoanCard } from '@/components/LoanCard';
import { PaymentCard } from '@/components/PaymentCard';
import { LoanDocumentsDialog } from '@/components/LoanDocumentsDialog';
import { computeRisk, computeFinancialSummary, RiskCard, FinancialSummaryCard, ReferencesCard, LoanHistoryCard } from '@/components/FichaIntegral';
import { RISK_COLORS, RISK_LABELS, type RiskAssessment, type FinancialSummary } from '@/lib/risk';

const DOCUMENT_ITEMS: { key: keyof UserDocuments; label: string; helper: string }[] = [
  { key: 'ccFrontalPicture', label: 'Cédula frontal', helper: 'Documento principal' },
  { key: 'ccBackPicture', label: 'Cédula respaldo', helper: 'Cara posterior del documento' },
  { key: 'selfiePicture', label: 'Selfie', helper: 'Validación facial del solicitante' },
  { key: 'empInvoiceFile', label: 'Comprobante', helper: 'Factura o soporte laboral' },
];

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [editingPassword, setEditingPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [subscriptionMsg, setSubscriptionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', id));
        if (!userDoc.exists()) {
          router.replace('/usuarios');
          return;
        }
        const data = userDoc.data() as Record<string, unknown>;
        const rawDocs = (data.documents as Record<string, string>) || {};
        const createdAtRaw = data.createdAt;
        const userData: User = {
          id: userDoc.id,
          email: (data.email as string) || '',
          phone: (data.phone as string) || '',
          name: (data.name as string) || '',
          lastName: (data.lastName as string) || '',
          isSubscribed: (data.isSubscribed as boolean) || false,
          admin: (data.admin as boolean) || false,
          documentType: (data.documentType as string) || '',
          documentNumber: (data.documentNumber as string) || '',
          countryCode: (data.countryCode as string) || '',
          direction: (data.direction as string) || '',
          city: (data.city as string) || '',
          createdAt: createdAtRaw instanceof Timestamp ? createdAtRaw.toDate() : undefined,
          workReferences: (data.workReferences as WorkReference[]) || undefined,
          maxLoanAmount: (data.maxLoanAmount as number) || undefined,
          documents: Object.keys(rawDocs).length > 0 ? {
            ccFrontalPicture: rawDocs.ccFrontalPicture || '',
            ccBackPicture: rawDocs.ccBackPicture || '',
            selfiePicture: rawDocs.selfiePicture || '',
            empInvoiceFile: rawDocs.empInvoiceFile || '',
          } : undefined,
        };
        setUser(userData);

        const pwd = await getUserPassword(id);
        setCurrentPassword(pwd);

        if (userData.phone) {
          const [userLoans, userPayments] = await Promise.all([
            getUserLoans(userData.phone),
            getPaymentsByPhone(userData.phone),
          ]);
          setLoans(userLoans);
          setPayments(userPayments);

          // Calcula perfil de riesgo y resumen financiero (sección 13: recalcular al consultar la ficha)
          const riskResult = computeRisk(userLoans, (data.maxLoanAmount as number) || undefined);
          const summaryResult = computeFinancialSummary(userLoans, userPayments);
          setRisk(riskResult);
          setSummary(summaryResult);
          // Persiste los campos de riesgo en el documento del usuario
          saveUserRisk(id, {
            riskProfile: riskResult.profile,
            maxLoanAmount: riskResult.maxLoanAmount,
            isBlockedForNewLoans: riskResult.isBlockedForNewLoans,
            hasHadLatePayments: riskResult.hasHadLatePayments,
            hasSevereLatePayments: riskResult.hasSevereLatePayments,
            totalLoans: riskResult.totalLoans,
            paidLoans: riskResult.paidLoans,
            activeLoans: riskResult.activeLoans,
            currentLateInstallments: riskResult.currentLateInstallments,
          });

          // If user has no documents in their profile, pull from most recent loan
          if (!userData.documents) {
            const loanWithDocs = userLoans.find(l =>
              l.loanInformation.ccFrontalPicture ||
              l.loanInformation.ccBackPicture ||
              l.loanInformation.selfiePicture ||
              l.loanInformation.empInvoiceFile
            );
            if (loanWithDocs) {
              setUser(prev => prev ? {
                ...prev,
                documents: {
                  ccFrontalPicture: loanWithDocs.loanInformation.ccFrontalPicture,
                  ccBackPicture: loanWithDocs.loanInformation.ccBackPicture,
                  selfiePicture: loanWithDocs.loanInformation.selfiePicture,
                  empInvoiceFile: loanWithDocs.loanInformation.empInvoiceFile,
                },
              } : prev);
            }
          }
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
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleToggleSubscription = async () => {
    if (!user) return;
    setSavingSubscription(true);
    setSubscriptionMsg(null);
    try {
      const newValue = !user.isSubscribed;
      await updateUserSubscription(id, newValue);
      setUser({ ...user, isSubscribed: newValue });
      setSubscriptionMsg({ type: 'success', text: newValue ? 'Usuario marcado como suscrito' : 'Suscripción removida' });
      setTimeout(() => setSubscriptionMsg(null), 3000);
    } catch {
      setSubscriptionMsg({ type: 'error', text: 'Error al actualizar la suscripción' });
    } finally {
      setSavingSubscription(false);
    }
  };

  const handleSavePassword = async () => {
    if (!newPassword || newPassword.length < 4) {
      setPasswordMsg({ type: 'error', text: 'La contraseña debe tener al menos 4 caracteres' });
      return;
    }
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      await updateUserPassword(id, newPassword);
      setCurrentPassword(newPassword);
      setNewPassword('');
      setEditingPassword(false);
      setPasswordMsg({ type: 'success', text: 'Contraseña actualizada' });
      setTimeout(() => setPasswordMsg(null), 3000);
    } catch {
      setPasswordMsg({ type: 'error', text: 'Error al actualizar la contraseña' });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!user) return;
    if (!confirm(`¿Eliminar a ${user.name} ${user.lastName} y todos sus datos (solicitudes, pagos, documentos)? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await deleteUser(user.id, user.phone);
      router.replace('/usuarios');
    } catch {
      alert('Error al eliminar el usuario');
      setDeleting(false);
    }
  };

  if (!user) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Link href="/usuarios" className="text-slate-500 hover:text-blue-600 transition-colors text-sm font-medium">
          ← Usuarios
        </Link>
        <button
          onClick={handleDeleteUser}
          disabled={deleting}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
        >
          {deleting ? 'Eliminando...' : '✕ Eliminar usuario'}
        </button>
      </div>

      {/* User info */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-2xl">
            {(user.name?.[0] || user.email?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <h1 className="text-slate-900 text-xl font-bold">{user.name} {user.lastName}</h1>
            <div className="flex gap-2 mt-1 flex-wrap">
              {user.isSubscribed && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Suscrito</span>
              )}
              {user.admin && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Admin</span>
              )}
              {risk && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${RISK_COLORS[risk.profile]}22`, color: RISK_COLORS[risk.profile] }}>
                  {RISK_LABELS[risk.profile]}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Datos personales */}
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2 mt-2">Datos personales</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {user.email && (
            <div><p className="text-slate-400 text-xs">Email</p><p className="text-slate-900 text-sm">{user.email}</p></div>
          )}
          {user.phone && (
            <div><p className="text-slate-400 text-xs">Teléfono</p><p className="text-slate-900 text-sm">{user.countryCode ? `${user.countryCode} ` : ''}{user.phone}</p></div>
          )}
          {user.documentType && (
            <div><p className="text-slate-400 text-xs">Tipo de documento</p><p className="text-slate-900 text-sm">{user.documentType}</p></div>
          )}
          {user.documentNumber && (
            <div><p className="text-slate-400 text-xs">Número de documento</p><p className="text-slate-900 text-sm">{user.documentNumber}</p></div>
          )}
          {user.direction && (
            <div><p className="text-slate-400 text-xs">Dirección</p><p className="text-slate-900 text-sm">{user.direction}</p></div>
          )}
          {user.city && (
            <div><p className="text-slate-400 text-xs">Ciudad</p><p className="text-slate-900 text-sm">{user.city}</p></div>
          )}
          {user.createdAt && (
            <div><p className="text-slate-400 text-xs">Cliente desde</p><p className="text-slate-900 text-sm">{user.createdAt.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</p></div>
          )}
          <div><p className="text-slate-400 text-xs">Suscripción</p><p className="text-slate-900 text-sm">{user.isSubscribed ? 'Activa' : 'Inactiva'}</p></div>
        </div>
      </div>

      {/* Perfil de riesgo + Resumen financiero */}
      {risk && <RiskCard risk={risk} />}
      {summary && <FinancialSummaryCard s={summary} />}

      {/* Password section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-slate-900 font-semibold">Contraseña</h2>
          {!editingPassword && (
            <button
              onClick={() => { setEditingPassword(true); setNewPassword(''); setPasswordMsg(null); }}
              className="text-blue-600 text-sm hover:underline font-medium"
            >
              Cambiar
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1">
            <p className="text-slate-400 text-xs">Contraseña actual</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-slate-900 text-sm font-mono">
                {currentPassword
                  ? showPassword ? currentPassword : '••••••••'
                  : 'Sin contraseña'}
              </p>
              {currentPassword && (
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-blue-600 text-xs transition-colors"
                >
                  {showPassword ? 'Ocultar' : 'Ver'}
                </button>
              )}
            </div>
          </div>
        </div>

        {editingPassword && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <p className="text-slate-400 text-xs mb-2">Nueva contraseña</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Nueva contraseña..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
              <button
                onClick={handleSavePassword}
                disabled={savingPassword}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingPassword ? '...' : 'Guardar'}
              </button>
              <button
                onClick={() => { setEditingPassword(false); setNewPassword(''); setPasswordMsg(null); }}
                className="text-slate-400 px-3 py-2 text-sm hover:text-slate-600 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {passwordMsg && (
          <p className={`text-xs mt-2 ${passwordMsg.type === 'success' ? 'text-blue-600' : 'text-red-500'}`}>
            {passwordMsg.text}
          </p>
        )}
      </div>

      {/* Subscription section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-slate-900 font-semibold">Suscripción</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              {user.isSubscribed ? 'El usuario tiene acceso completo a la plataforma.' : 'El usuario aún no está suscrito.'}
            </p>
          </div>
          <button
            onClick={handleToggleSubscription}
            disabled={savingSubscription}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
              user.isSubscribed ? 'bg-blue-600' : 'bg-slate-200'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                user.isSubscribed ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        {subscriptionMsg && (
          <p className={`text-xs mt-1 ${subscriptionMsg.type === 'success' ? 'text-blue-600' : 'text-red-500'}`}>
            {subscriptionMsg.text}
          </p>
        )}
      </div>

      {/* Documents */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-slate-900 font-semibold">Documentos del cliente</h2>
            <p className="text-slate-400 text-xs mt-1">
              {user.documents ? 'Cargados al enviar la última solicitud.' : 'Sin documentos aún. Se cargarán cuando el cliente envíe su primera solicitud.'}
            </p>
          </div>
          {user.documents && (
            <button
              onClick={() => setShowDocs(true)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#7d977d] hover:bg-[#7d977d]/10"
            >
              Abrir visor
            </button>
          )}
        </div>

        {user.documents ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {DOCUMENT_ITEMS.map(item => {
              const url = user.documents?.[item.key];
              return (
                <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.helper}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${url ? 'bg-[#7d977d]/14 text-[#537053]' : 'bg-slate-200 text-slate-500'}`}>
                      {url ? 'Cargado' : 'Pendiente'}
                    </span>
                  </div>
                  {url && (
                    <div className="mt-4">
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-[#7d977d] hover:bg-[#7d977d]/10"
                      >
                        Ver archivo
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {DOCUMENT_ITEMS.map(item => (
              <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.helper}</p>
                  </div>
                  <span className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold bg-slate-200 text-slate-500">
                    Pendiente
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Referencias (personales + laborales) */}
      <ReferencesCard loans={loans} user={user} />

      {/* Historial de préstamos con detalle de cuotas */}
      <LoanHistoryCard loans={loans} />

      {/* User loans */}
      <h2 className="text-slate-900 font-bold text-lg mb-3">
        Solicitudes ({loans.length})
      </h2>
      {loans.length === 0 ? (
        <p className="text-slate-400">Sin solicitudes</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {loans.map(loan => (
            <LoanCard key={loan.id} loan={loan} userName={[user.name, user.lastName].filter(Boolean).join(' ') || undefined} />
          ))}
        </div>
      )}

      <h2 className="text-slate-900 font-bold text-lg mb-3 mt-6">
        Pagos ({payments.length})
      </h2>
      {payments.length === 0 ? (
        <p className="text-slate-400">Sin pagos registrados</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {payments.map(payment => (
            <PaymentCard key={payment.id} payment={payment} />
          ))}
        </div>
      )}

      {showDocs && user.documents && (
        <LoanDocumentsDialog
          loanInfo={{
            ccFrontalPicture: user.documents.ccFrontalPicture || '',
            ccBackPicture: user.documents.ccBackPicture || '',
            selfiePicture: user.documents.selfiePicture || '',
            empInvoiceFile: user.documents.empInvoiceFile || '',
            firstReference: { phone: '', relationship: '' },
            secondReference: { phone: '', relationship: '' },
            bankInformation: {},
            direction: '',
          }}
          onClose={() => setShowDocs(false)}
        />
      )}
    </div>
  );
}
