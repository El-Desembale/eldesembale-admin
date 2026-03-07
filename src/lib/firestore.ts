import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { LoanRequest, User } from './types';

function parseLoanInformation(raw: Record<string, unknown>) {
  return {
    firstReference: (raw?.first_reference as { phone: string; relationship: string }) || { phone: '', relationship: '' },
    secondReference: (raw?.second_reference as { phone: string; relationship: string }) || { phone: '', relationship: '' },
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
  };
}

export async function getLoans(): Promise<LoanRequest[]> {
  const q = query(collection(db, 'loan_request'), orderBy('created_at', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => parseLoan(d.id, d.data() as Record<string, unknown>));
}

export async function getUserLoans(phone: string): Promise<LoanRequest[]> {
  const q = query(collection(db, 'loan_request'), where('phone', '==', phone));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => parseLoan(d.id, d.data() as Record<string, unknown>));
}

export async function updateLoanStatus(loanId: string, status: LoanRequest['status']): Promise<void> {
  await updateDoc(doc(db, 'loan_request', loanId), { status });
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

export async function saveFcmToken(uid: string, token: string): Promise<void> {
  await updateDoc(doc(db, 'admins', uid), { fcmToken: token, updatedAt: new Date() })
    .catch(async () => {
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'admins', uid), { fcmToken: token, updatedAt: new Date() });
    });
}
