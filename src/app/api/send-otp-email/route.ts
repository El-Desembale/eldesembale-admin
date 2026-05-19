import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { collection, query, where, getDocs, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface SendOtpPayload {
  phone: string;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;
  const visible = user.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

export async function POST(req: NextRequest) {
  const body: SendOtpPayload = await req.json();
  const { phone } = body;

  if (!phone) {
    return NextResponse.json(
      { success: false, error: 'phone es requerido' },
      { status: 400 }
    );
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const fromEmail = process.env.SMTP_FROM || smtpUser;

  if (!smtpUser || !smtpPass) {
    return NextResponse.json(
      { success: false, error: 'Email no configurado en el servidor' },
      { status: 500 }
    );
  }

  try {
    const userQuery = query(collection(db, 'users'), where('phone', '==', phone));
    const userSnap = await getDocs(userQuery);

    if (userSnap.empty) {
      return NextResponse.json(
        { success: false, error: 'No existe un usuario con ese número' },
        { status: 404 }
      );
    }

    const userData = userSnap.docs[0].data() as { email?: string; name?: string };
    const email = userData.email;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'El usuario no tiene un correo registrado' },
        { status: 400 }
      );
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await setDoc(doc(db, 'otp_codes', phone), {
      code,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: Timestamp.now(),
      phone,
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0a1a0a; border-radius: 16px; padding: 32px; color: #ffffff;">
        <h2 style="color: #2FFF00; margin: 0 0 16px 0; font-size: 22px;">Recuperación de contraseña</h2>
        <p style="color: #d1d5db; font-size: 14px; margin: 0 0 24px 0;">
          Hola${userData.name ? ` ${userData.name}` : ''}, usa el siguiente código para restablecer tu contraseña en El Desembale.
        </p>
        <div style="background: #000000; border: 1px solid #2FFF00; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px 0;">
          <div style="color: #9ca3af; font-size: 12px; letter-spacing: 2px; margin-bottom: 8px;">CÓDIGO DE VERIFICACIÓN</div>
          <div style="color: #2FFF00; font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">${code}</div>
        </div>
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          Este código expira en 10 minutos. Si no solicitaste este cambio, ignora este correo.
        </p>
        <p style="margin-top: 24px; color: #6b7280; font-size: 11px; text-align: center;">El Desembale</p>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"El Desembale" <${fromEmail}>`,
      to: email,
      subject: 'Tu código de recuperación de contraseña',
      html,
    });

    return NextResponse.json({
      success: true,
      verificationId: phone,
      emailMasked: maskEmail(email),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
