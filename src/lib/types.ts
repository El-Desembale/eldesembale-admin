import type { LoanPricing } from './loan-calc';
export type { LoanPricing } from './loan-calc';

export interface Reference {
  phone: string;
  relationship: string;
  name?: string;
  lastName?: string;
}

export interface WorkReference {
  companyName: string;
  contactName?: string;
  userPosition?: string;
  contactPhone?: string;
  contactEmail?: string;
  companyAddress?: string;
  employmentTime?: string;
  contractType?: string;
  notes?: string;
}

export type BankInformation = Record<string, string>;

export interface LoanInformation {
  firstReference: Reference;
  secondReference: Reference;
  ccBackPicture: string;
  selfiePicture: string;
  empInvoiceFile: string;
  ccFrontalPicture: string;
  bankInformation: BankInformation;
  direction: string;
}

export interface LoanRequest {
  id: string;
  amount: number;
  createdAt: Date;
  installments: number;
  interest: number;
  paymentPeriod: string;
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'disbursed';
  installmentsPaid: number;
  phone: string;
  isSubscribed: boolean;
  loanInformation: LoanInformation;
  rejectionReason?: string;
  /** Desglose calculado y guardado al crear el crédito (capital, conceptos, Wompi). */
  pricing?: LoanPricing | null;
}

export interface UserDocuments {
  ccFrontalPicture?: string;
  ccBackPicture?: string;
  selfiePicture?: string;
  empInvoiceFile?: string;
}

export interface User {
  id: string;
  email: string;
  phone: string;
  name: string;
  lastName: string;
  isSubscribed: boolean;
  admin: boolean;
  loanRequests?: LoanRequest[];
  documents?: UserDocuments;
  // Datos personales (ya existen en BD para usuarios registrados)
  documentType?: string;
  documentNumber?: string;
  countryCode?: string;
  direction?: string;
  city?: string;
  createdAt?: Date;
  // Referencias laborales (opcional, se agrega cuando existan)
  workReferences?: WorkReference[];
  // Campos de riesgo persistidos (calculados)
  riskProfile?: 'NEW' | 'GOOD_PAYER' | 'MEDIUM_RISK' | 'BLOCKED';
  maxLoanAmount?: number;
  isBlockedForNewLoans?: boolean;
}

export type LoanStatus = LoanRequest['status'];

export const STATUS_LABELS: Record<LoanStatus, string> = {
  pending: 'Pendiente',
  reviewing: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  disbursed: 'Desembolsada',
};

export const STATUS_COLORS: Record<LoanStatus, string> = {
  pending: '#f59e0b',
  reviewing: '#a78bfa',
  approved: '#60a5fa',
  rejected: '#f87171',
  disbursed: '#22c55e',
};

// Payment types
export type PaymentType = 'subscription' | 'installment';
export type PaymentStatus = 'APPROVED' | 'DECLINED' | 'ERROR' | 'PENDING_REVIEW';
export type PaymentSource = 'wompi' | 'manual';

export interface Payment {
  id: string;
  reference: string;
  type: PaymentType;
  source: PaymentSource;
  status: PaymentStatus;
  amount: number;
  amountInCents: number;
  /** Valor bruto pagado por el cliente. */
  grossAmount: number;
  /** Comisión Wompi de la transacción (exacta si fue registrada; estimada para pagos legacy). */
  wompiFee: number;
  /** Valor neto recibido por la empresa (bruto - comisión Wompi). */
  netAmount: number;
  currency: string;
  userPhone: string;
  userEmail: string;
  userName: string;
  loanId: string | null;
  installmentNumber: number | null;
  installmentsToPay: number;
  proofUrl?: string;
  proofName?: string;
  proofContentType?: string;
  createdAt: Date;
  reviewedAt?: Date | null;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  APPROVED: 'Aprobado',
  DECLINED: 'Rechazado',
  ERROR: 'Error',
  PENDING_REVIEW: 'Por revisar',
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  APPROVED: '#22c55e',
  DECLINED: '#f87171',
  ERROR: '#f59e0b',
  PENDING_REVIEW: '#3b82f6',
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  subscription: 'Suscripción',
  installment: 'Cuota',
};
