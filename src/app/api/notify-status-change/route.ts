import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

function getAdminApp(): App {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not set');
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

type LoanStatus = 'pending' | 'approved' | 'rejected' | 'in_process' | 'in_disbursement_process';

interface StatusChangePayload {
  email: string;
  userName: string;
  phone?: string;
  loanId: string;
  amount: number;
  newStatus: LoanStatus;
}

const STATUS_CONFIG: Record<LoanStatus, { label: string; message: string; color: string; icon: string }> = {
  pending: {
    label: 'Pendiente',
    message: 'Tu solicitud de préstamo ha sido recibida y está pendiente de revisión. Pronto un asesor la revisará.',
    color: '#f59e0b',
    icon: '⏳',
  },
  in_process: {
    label: 'En revisión',
    message: 'Tu solicitud está siendo revisada por nuestro equipo. Te notificaremos cuando haya una actualización.',
    color: '#3b82f6',
    icon: '🔍',
  },
  in_disbursement_process: {
    label: 'En proceso de desembolso',
    message: '¡Buenas noticias! Tu préstamo ha sido aprobado y estamos procesando el desembolso. Pronto recibirás el dinero.',
    color: '#8b5cf6',
    icon: '💸',
  },
  approved: {
    label: 'Activo',
    message: '¡Felicitaciones! Tu préstamo ha sido desembolsado y ya está activo. Recuerda estar al día con tus pagos.',
    color: '#22c55e',
    icon: '✅',
  },
  rejected: {
    label: 'Rechazado',
    message: 'Lamentamos informarte que tu solicitud de préstamo no fue aprobada en esta oportunidad. Puedes intentar nuevamente más adelante.',
    color: '#ef4444',
    icon: '❌',
  },
};

export async function POST(req: NextRequest) {
  const body: StatusChangePayload = await req.json();
  const { email, userName, phone, loanId, amount, newStatus } = body;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const fromEmail = process.env.SMTP_FROM || smtpUser;

  if (!smtpUser || !smtpPass) {
    return NextResponse.json({ success: false, error: 'Email no configurado' }, { status: 500 });
  }

  if (!email) {
    return NextResponse.json({ success: false, error: 'El cliente no tiene correo registrado' }, { status: 400 });
  }

  const config = STATUS_CONFIG[newStatus];
  const amountFormatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);

  const displayName = userName || 'Cliente';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; color: #0f172a; border: 1px solid #e2e8f0;">
      <h2 style="color: ${config.color}; margin: 0 0 8px 0; font-size: 20px;">
        ${config.icon} Actualización de tu solicitud
      </h2>
      <p style="color: #9ca3af; margin: 0 0 24px 0; font-size: 13px;">Hola ${displayName}</p>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
        <p style="color: #9ca3af; font-size: 13px; margin: 0 0 4px 0;">Estado actual</p>
        <p style="color: ${config.color}; font-size: 22px; font-weight: bold; margin: 0;">${config.label}</p>
      </div>

      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
        ${config.message}
      </p>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Monto solicitado</td>
          <td style="padding: 8px 0; color: #0f172a; font-size: 14px; text-align: right; font-weight: bold;">${amountFormatted}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">No. solicitud</td>
          <td style="padding: 8px 0; color: #9ca3af; font-size: 12px; text-align: right;">${loanId.slice(0, 8)}...</td>
        </tr>
      </table>

      <p style="margin-top: 24px; color: #6b7280; font-size: 11px; text-align: center;">
        El Desembale · Si tienes dudas, contáctanos
      </p>
    </div>
  `;

  // Send email
  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: `"El Desembale" <${fromEmail}>`,
      to: email,
      subject: `${config.icon} Tu solicitud está ${config.label.toLowerCase()} · ${amountFormatted}`,
      html,
    });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }

  // Send push notification if phone is provided
  if (phone) {
    try {
      const app = getAdminApp();
      const db = getFirestore(app);
      const snap = await db.collection('users').where('phone', '==', phone).limit(1).get();
      if (!snap.empty) {
        const fcmToken = snap.docs[0].data().fcmToken as string | undefined;
        if (fcmToken) {
          await getMessaging(app).send({
            token: fcmToken,
            notification: {
              title: `${config.icon} Solicitud ${config.label}`,
              body: config.message,
            },
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default' } } },
          });
        }
      }
    } catch (e) {
      // Push failure is non-blocking — email already sent
      console.error('Push notification error:', e);
    }
  }

  return NextResponse.json({ success: true });
}
