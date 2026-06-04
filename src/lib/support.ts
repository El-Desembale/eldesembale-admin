import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export type SupportSource = 'web_app' | 'mobile_app';
export type SupportSenderRole = 'customer' | 'admin';

export interface SupportThread {
  id: string;
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  sourcePlatforms: SupportSource[];
  lastMessagePreview: string;
  lastMessageAt: Date | null;
  lastMessageBy: SupportSenderRole | null;
  adminUnreadCount: number;
  customerUnreadCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface SupportMessage {
  id: string;
  text: string;
  senderRole: SupportSenderRole;
  senderName: string;
  source: SupportSource | 'admin';
  createdAt: Date | null;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  return null;
}

function parseThread(id: string, data: Record<string, unknown>): SupportThread {
  return {
    id,
    customerPhone: (data.customerPhone as string) || '',
    customerName: (data.customerName as string) || '',
    customerEmail: (data.customerEmail as string) || '',
    sourcePlatforms: ((data.sourcePlatforms as SupportSource[]) || []).filter(Boolean),
    lastMessagePreview: (data.lastMessagePreview as string) || '',
    lastMessageAt: parseDate(data.lastMessageAt),
    lastMessageBy: (data.lastMessageBy as SupportSenderRole | null) || null,
    adminUnreadCount: (data.adminUnreadCount as number) || 0,
    customerUnreadCount: (data.customerUnreadCount as number) || 0,
    createdAt: parseDate(data.createdAt),
    updatedAt: parseDate(data.updatedAt),
  };
}

function parseMessage(id: string, data: Record<string, unknown>): SupportMessage {
  return {
    id,
    text: (data.text as string) || '',
    senderRole: ((data.senderRole as SupportSenderRole) || 'customer'),
    senderName: (data.senderName as string) || '',
    source: ((data.source as SupportSource | 'admin') || 'web_app'),
    createdAt: parseDate(data.createdAt),
  };
}

export function subscribeToSupportThreads(
  callback: (threads: SupportThread[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'support_threads'), orderBy('lastMessageAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => parseThread(d.id, d.data() as Record<string, unknown>)));
  });
}

export function subscribeToSupportMessages(
  threadId: string,
  callback: (messages: SupportMessage[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'support_threads', threadId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => parseMessage(d.id, d.data() as Record<string, unknown>)));
  });
}

export async function sendAdminSupportMessage(params: {
  threadId: string;
  text: string;
  adminName: string;
}): Promise<void> {
  const trimmed = params.text.trim();
  if (!trimmed) return;

  const threadRef = doc(db, 'support_threads', params.threadId);
  await addDoc(collection(threadRef, 'messages'), {
    text: trimmed,
    senderRole: 'admin',
    senderName: params.adminName || 'Admin',
    source: 'admin',
    createdAt: serverTimestamp(),
  });

  await updateDoc(threadRef, {
    lastMessagePreview: trimmed.slice(0, 160),
    lastMessageAt: serverTimestamp(),
    lastMessageBy: 'admin',
    adminUnreadCount: 0,
    customerUnreadCount: increment(1),
    updatedAt: serverTimestamp(),
  });
}

export async function markSupportThreadSeenByAdmin(threadId: string): Promise<void> {
  await updateDoc(doc(db, 'support_threads', threadId), {
    adminUnreadCount: 0,
    updatedAt: serverTimestamp(),
  });
}
