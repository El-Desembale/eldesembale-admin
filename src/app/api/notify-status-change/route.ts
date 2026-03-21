import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

type LoanStatus = 'pending' | 'approved' | 'rejected' | 'in_process' | 'in_disbursement_process';

interface StatusChangePayload {
  email: string;
  userName: string;
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
    label: 'Aprobado',
    message: '¡Felicitaciones! Tu préstamo ha sido aprobado y desembolsado exitosamente. Recuerda estar al día con tus pagos.',
    color: '#2FFF00',
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
  const { email, userName, loanId, amount, newStatus } = body;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const fromEmail = process.env.SMTP_FROM || smtpUser;

  if (!smtpUser || !smtpPass) {
    return NextResponse.json(
      { success: false, error: 'Email no configurado' },
      { status: 500 }
    );
  }

  if (!email) {
    return NextResponse.json(
      { success: false, error: 'El cliente no tiene correo registrado' },
      { status: 400 }
    );
  }

  const config = STATUS_CONFIG[newStatus];
  const amountFormatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);

  const displayName = userName || 'Cliente';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0a1a0a; border-radius: 16px; padding: 32px; color: #ffffff;">
      <h2 style="color: ${config.color}; margin: 0 0 8px 0; font-size: 20px;">
        ${config.icon} Actualización de tu solicitud
      </h2>
      <p style="color: #9ca3af; margin: 0 0 24px 0; font-size: 13px;">Hola ${displayName}</p>

      <div style="background: #061006; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #9ca3af; font-size: 13px; margin: 0 0 4px 0;">Estado actual</p>
        <p style="color: ${config.color}; font-size: 22px; font-weight: bold; margin: 0;">${config.label}</p>
      </div>

      <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
        ${config.message}
      </p>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Monto solicitado</td>
          <td style="padding: 8px 0; color: #ffffff; font-size: 14px; text-align: right; font-weight: bold;">${amountFormatted}</td>
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

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
