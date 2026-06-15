import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase';
import { LoanRequest, User, Payment } from './types';
import { pricingFromFirestore, wompiFeeFromGross } from './loan-calc';

function parseReference(raw: Record<string, unknown> | undefined) {
  const r = raw || {};
  return {
    phone: r.phone != null ? String(r.phone) : '',
    relationship: (r.relationship as string) || '',
    name: (r.name as string) || '',
    lastName: (r.last_name as string) || (r.lastName as string) || '',
  };
}

function parseLoanInformation(raw: Record<string, unknown>) {
  return {
    firstReference: parseReference(raw?.first_reference as Record<string, unknown>),
    secondReference: parseReference(raw?.second_reference as Record<string, unknown>),
    ccBackPicture: (raw?.cc_back_picture as string) || '',
    selfiePicture: (raw?.selfie_picture as string) || '',
    empInvoiceFile: (raw?.emp_invoice_file as string) || '',
    ccFrontalPicture: (raw?.cc_frontal_picture as string) || '',
    bankInformation: (raw?.bank_information as Record<string, string>) || {},
    direction: (raw?.direction as string) || '',
  };
}

function parseLoan(docId: string, data: Record<string, unknown>): LoanRequest {
  const createdAt = data.created_at instanceof Timestamp
    ? data.created_at.toDate()
    : new Date();

  return {
    id: docId,
    amount: (data.amount as number) || 0,
    createdAt,
    installments: (data.installments as number) || 0,
    interest: (data.interest as number) || 0,
    paymentPeriod: (data.payment_period as string) || '',
    status: (data.status as LoanRequest['status']) || 'pending',
    installmentsPaid: (data.installments_paid as number) || 0,
    phone: (data.phone as string) || '',
    isSubscribed: (data.isSubscribed as boolean) || false,
    loanInformation: parseLoanInformation((data.loan_information as Record<string, unknown>) || {}),
    rejectionReason: (data.rejection_reason as string) || '',
    pricing: pricingFromFirestore(data.pricing as Record<string, unknown> | undefined),
  };
}

export async function getLoans(): Promise<LoanRequest[]> {
  const q = query(collection(db, 'loan_request'), orderBy('created_at', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => parseLoan(d.id, d.data() as Record<string, unknown>));
}

export async function getUserLoans(phone: string): Promise<LoanRequest[]> {
  // Filtra client-side sobre la colección completa: las reglas de Firestore
  // permiten listar `loan_request` pero pueden rechazar queries con `where`
  // específicas, lo cual deja la lista en blanco sin error visible.
  const all = await getLoans();
  return all.filter(l => l.phone === phone);
}

export async function updateLoanStatus(loanId: string, status: LoanRequest['status']): Promise<void> {
  await updateDoc(doc(db, 'loan_request', loanId), { status });
}

export async function rejectLoan(loanId: string, reason: string): Promise<void> {
  await updateDoc(doc(db, 'loan_request', loanId), {
    status: 'rejected',
    rejection_reason: reason,
    rejected_at: Timestamp.now(),
  });
}

export async function disburseLoan(loanId: string, proofUrl: string): Promise<void> {
  await updateDoc(doc(db, 'loan_request', loanId), {
    status: 'disbursed',
    disbursement_proof: proofUrl,
    disbursed_at: Timestamp.now(),
  });
}

export async function deleteLoanRequest(loanId: string): Promise<void> {
  await deleteDoc(doc(db, 'loan_request', loanId));
}

export async function getUsers(): Promise<User[]> {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      email: (data.email as string) || '',
      phone: (data.phone as string) || '',
      name: (data.name as string) || '',
      lastName: (data.lastName as string) || '',
      isSubscribed: (data.isSubscribed as boolean) || false,
      admin: (data.admin as boolean) || false,
    };
  });
}

export async function getUserPassword(userId: string): Promise<string | null> {
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return (data.password as string) || null;
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId), { password: newPassword });
}

// Persiste los campos de riesgo calculados en el documento del usuario
export async function saveUserRisk(userId: string, risk: {
  riskProfile: string;
  maxLoanAmount: number;
  isBlockedForNewLoans: boolean;
  hasHadLatePayments: boolean;
  hasSevereLatePayments: boolean;
  totalLoans: number;
  paidLoans: number;
  activeLoans: number;
  currentLateInstallments: number;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', userId), {
      riskProfile: risk.riskProfile,
      maxLoanAmount: risk.maxLoanAmount,
      isBlockedForNewLoans: risk.isBlockedForNewLoans,
      hasHadLatePayments: risk.hasHadLatePayments,
      hasSevereLatePayments: risk.hasSevereLatePayments,
      totalLoans: risk.totalLoans,
      paidLoans: risk.paidLoans,
      activeLoans: risk.activeLoans,
      currentLateInstallments: risk.currentLateInstallments,
      riskUpdatedAt: Timestamp.now(),
    });
  } catch (e) {
    console.error('saveUserRisk error', e);
  }
}

export async function updateUserSubscription(userId: string, isSubscribed: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', userId), { isSubscribed });
}

export async function deleteUser(userId: string, userPhone: string): Promise<void> {
  // 1. Loans del usuario
  const loans = await getUserLoans(userPhone);

  // 2. Recopilar URLs de Storage de los documentos del loan
  const storageUrls: string[] = [];
  for (const loan of loans) {
    const info = loan.loanInformation;
    [info.ccFrontalPicture, info.ccBackPicture, info.selfiePicture, info.empInvoiceFile]
      .filter(Boolean)
      .forEach(url => storageUrls.push(url as string));
  }

  // 3. Eliminar solicitudes
  await Promise.all(loans.map(l => deleteDoc(doc(db, 'loan_request', l.id))));

  // 4. Eliminar pagos
  const allPayments = await getPayments();
  const userPayments = allPayments.filter(p => p.userPhone === userPhone);
  await Promise.all(userPayments.map(p => deleteDoc(doc(db, 'payments', p.id))));

  // 5. Eliminar archivos de Storage (best-effort)
  await Promise.allSettled(
    storageUrls.map(url => deleteObject(ref(storage, url)).catch(() => null))
  );

  // 6. Eliminar OTP codes por teléfono/email (best-effort)
  try {
    const otpSnap = await getDocs(query(collection(db, 'otp_codes'), where('phone', '==', userPhone)));
    await Promise.all(otpSnap.docs.map(d => deleteDoc(d.ref)));
  } catch { /* colección puede no existir */ }

  // 7. Eliminar documento del usuario
  await deleteDoc(doc(db, 'users', userId));
}

// Payments

function parsePayment(docId: string, data: Record<string, unknown>): Payment {
  const createdAt = data.created_at instanceof Timestamp
    ? data.created_at.toDate()
    : new Date();

  const amount = (data.amount_in_cents as number)
    ? (data.amount_in_cents as number) / 100
    : ((data.amount as number) || 0);
  // Campos financieros estándar. Pagos legacy sin desglose: la comisión Wompi se
  // estima con las tarifas por defecto para no dejar el costo en cero.
  const grossAmount = typeof data.gross_amount === 'number' ? data.gross_amount : amount;
  const wompiFee = typeof data.wompi_fee === 'number' ? data.wompi_fee : wompiFeeFromGross(grossAmount);
  const netAmount = typeof data.net_amount === 'number' ? data.net_amount : grossAmount - wompiFee;

  return {
    id: docId,
    reference: (data.reference as string) || '',
    type: (data.type as Payment['type']) || 'subscription',
    source: (data.source as Payment['source']) || 'wompi',
    status: (data.status as Payment['status']) || 'ERROR',
    amount,
    amountInCents: (data.amount_in_cents as number) || 0,
    grossAmount,
    wompiFee,
    netAmount,
    currency: (data.currency as string) || 'COP',
    userPhone: (data.user_phone as string) || '',
    userEmail: (data.user_email as string) || '',
    userName: (data.user_name as string) || '',
    loanId: (data.loan_id as string) || null,
    installmentNumber: (data.installment_number as number) || null,
    installmentsToPay: (data.installments_to_pay as number) || 1,
    proofUrl: (data.proof_url as string) || '',
    proofName: (data.proof_name as string) || '',
    proofContentType: (data.proof_content_type as string) || '',
    createdAt,
    reviewedAt: data.reviewed_at instanceof Timestamp ? data.reviewed_at.toDate() : null,
  };
}

export async function getPayments(): Promise<Payment[]> {
  const q = query(collection(db, 'payments'), orderBy('created_at', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => parsePayment(d.id, d.data() as Record<string, unknown>));
}

export async function getPaymentsByPhone(phone: string): Promise<Payment[]> {
  const all = await getPayments();
  return all.filter(p => p.userPhone === phone);
}

export async function getPaymentsByLoanId(loanId: string): Promise<Payment[]> {
  const all = await getPayments();
  return all.filter(p => p.loanId === loanId);
}

async function findUserDocsForPayment(payment: Payment) {
  const matched = new Map<string, Awaited<ReturnType<typeof getDocs>>['docs'][number]>();

  const normalizedPhones = Array.from(
    new Set(
      [payment.userPhone, payment.userPhone.replace(/\s/g, '')].filter(Boolean),
    ),
  );

  for (const phone of normalizedPhones) {
    const usersSnap = await getDocs(
      query(collection(db, 'users'), where('phone', '==', phone)),
    );
    usersSnap.docs.forEach((userDoc) => matched.set(userDoc.id, userDoc));
  }

  if (payment.userEmail) {
    const usersByEmail = await getDocs(
      query(collection(db, 'users'), where('email', '==', payment.userEmail)),
    );
    usersByEmail.docs.forEach((userDoc) => matched.set(userDoc.id, userDoc));
  }

  return Array.from(matched.values());
}

async function notifyManualPaymentApproved(payment: Payment): Promise<void> {
  try {
    await fetch('/api/notify-manual-payment-approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId: payment.id,
        paymentType: payment.type,
        amount: payment.amount,
        amountInCents: payment.amountInCents,
        userName: payment.userName,
        email: payment.userEmail,
        phone: payment.userPhone,
        loanId: payment.loanId,
        installmentNumber: payment.installmentNumber,
        installmentsToPay: payment.installmentsToPay,
      }),
    });
  } catch (error) {
    console.error('notifyManualPaymentApproved error', error);
  }
}

export async function approveManualPayment(payment: Payment): Promise<void> {
  if (payment.source !== 'manual' || payment.status !== 'PENDING_REVIEW') return;

  const batch = writeBatch(db);
  const paymentRef = doc(db, 'payments', payment.id);
  batch.update(paymentRef, {
    status: 'APPROVED',
    reviewed_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  });

  if (payment.type === 'subscription') {
    const userDocs = await findUserDocsForPayment(payment);
    userDocs.forEach((userDoc) => {
      batch.update(userDoc.ref, {
        isSubscribed: true,
        updatedAt: Timestamp.now(),
      });
    });
  }

  if (payment.type === 'installment' && payment.loanId) {
    const loanRef = doc(db, 'loan_request', payment.loanId);
    const loanSnap = await getDoc(loanRef);
    if (loanSnap.exists()) {
      const data = loanSnap.data() as Record<string, unknown>;
      const currentPaid = (data.installments_paid as number) || 0;
      const totalInstallments = (data.installments as number) || currentPaid;
      const nextPaid = Math.min(currentPaid + Math.max(payment.installmentsToPay, 1), totalInstallments);
      batch.update(loanRef, {
        installments_paid: nextPaid,
        updated_at: Timestamp.now(),
      });
    }
  }

  await batch.commit();
  await notifyManualPaymentApproved(payment);
}

export async function rejectManualPayment(paymentId: string): Promise<void> {
  await updateDoc(doc(db, 'payments', paymentId), {
    status: 'DECLINED',
    reviewed_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  });
}

// Budget

export async function getBudgetConfig(): Promise<{ totalCapital: number } | null> {
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'settings', 'budget'));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return { totalCapital: (data.total_capital as number) || 0 };
}

export async function setBudgetConfig(totalCapital: number): Promise<void> {
  const { setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'settings', 'budget'), {
    total_capital: totalCapital,
    updated_at: new Date(),
  });
}

export async function saveFcmToken(uid: string, token: string): Promise<void> {
  await updateDoc(doc(db, 'admins', uid), { fcmToken: token, updatedAt: new Date() })
    .catch(async () => {
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'admins', uid), { fcmToken: token, updatedAt: new Date() });
    });
}
