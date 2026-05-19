import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface VerifyOtpPayload {
  phone: string;
  code: string;
}

export async function POST(req: NextRequest) {
  const body: VerifyOtpPayload = await req.json();
  const { phone, code } = body;

  if (!phone || !code) {
    return NextResponse.json(
      { success: false, error: 'phone y code son requeridos' },
      { status: 400 }
    );
  }

  try {
    const ref = doc(db, 'otp_codes', phone);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      return NextResponse.json({ success: false, error: 'Código no encontrado' });
    }

    const data = snap.data() as { code: string; expiresAt: Timestamp };
    const expiresAt = data.expiresAt.toDate();

    if (Date.now() > expiresAt.getTime()) {
      await deleteDoc(ref);
      return NextResponse.json({ success: false, error: 'El código expiró' });
    }

    if (data.code !== code) {
      return NextResponse.json({ success: false, error: 'Código incorrecto' });
    }

    await deleteDoc(ref);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
