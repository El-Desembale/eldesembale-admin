import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

type LoanStatus = 'pending' | 'reviewing' | 'approved' | 'rejected' | 'disbursed';

interface StatusChangePayload {
  email: string;
  userName: string;
  phone?: string;
  loanId: string;
  amount: number;
  newStatus: LoanStatus;
  installments?: number;
  paymentPeriod?: string;
  interest?: number;
  createdAt?: string;
  proofUrl?: string;
  rejectionReason?: string;
  /** Desglose persistido (modelo nuevo): monto y fecha por cuota. */
  installmentRows?: { amount: number; dueDate: string }[];
  /** Total a pagar por el cliente (modelo nuevo). */
  totalCliente?: number;
}

function calcInstallmentDate(base: Date, index: number, paymentPeriod: string): Date {
  if (paymentPeriod === 'Mensual') {
    return new Date(base.getFullYear(), base.getMonth() + 1 + index, base.getDate());
  }
  const first = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
  return new Date(first.getTime() + 15 * index * 24 * 60 * 60 * 1000);
}

const STATUS_CONFIG: Record<LoanStatus, { label: string; message: string; color: string; icon: string }> = {
  pending: {
    label: 'Pendiente',
    message: 'Tu solicitud de préstamo ha sido recibida y está pendiente de revisión. Pronto un asesor la revisará.',
    color: '#f59e0b',
    icon: '⏳',
  },
  reviewing: {
    label: 'En revisión',
    message: 'Tu solicitud está siendo revisada por uno de nuestros asesores. Te notificaremos el resultado pronto.',
    color: '#a78bfa',
    icon: '🔍',
  },
  approved: {
    label: 'Aprobada',
    message: '¡Buenas noticias! Tu solicitud ha sido aprobada y está en espera de ser desembolsada. Pronto recibirás el dinero.',
    color: '#60a5fa',
    icon: '✅',
  },
  rejected: {
    label: 'Rechazada',
    message: 'Lamentamos informarte que tu solicitud de préstamo no fue aprobada en esta oportunidad. Puedes intentar nuevamente más adelante.',
    color: '#ef4444',
    icon: '❌',
  },
  disbursed: {
    label: 'Desembolsada',
    message: '¡Felicitaciones! Tu préstamo ha sido desembolsado. Recuerda estar al día con tus pagos.',
    color: '#22c55e',
    icon: '💸',
  },
};

export async function POST(req: NextRequest) {
  const body: StatusChangePayload = await req.json();
  const { email, userName, phone, loanId, amount, newStatus, installments, paymentPeriod, interest, createdAt, proofUrl, rejectionReason, installmentRows, totalCliente } = body;

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

  const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

  let installmentTableHtml = '';
  if (newStatus === 'disbursed' && installments && installments > 0 && paymentPeriod && createdAt) {
    // Modelo nuevo: usar el desglose persistido si viene; si no, fallback al cálculo previo.
    const base = new Date(createdAt);
    const legacyAmount = interest && installments > 0
      ? ((amount * interest) - amount + (amount / installments))
      : amount / installments;
    const rowsData = installmentRows && installmentRows.length > 0
      ? installmentRows.map((r) => ({ date: new Date(r.dueDate), amount: r.amount }))
      : Array.from({ length: installments }, (_, i) => ({ date: calcInstallmentDate(base, i, paymentPeriod), amount: legacyAmount }));
    const rows = rowsData.map((r, i) => {
      const dateStr = r.date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
      return `<tr>
        <td style="padding: 6px 8px; color: #64748b; font-size: 13px;">Cuota ${i + 1}</td>
        <td style="padding: 6px 8px; color: #0f172a; font-size: 13px; text-align: center;">${dateStr}</td>
        <td style="padding: 6px 8px; color: #2563eb; font-size: 13px; text-align: right; font-weight: bold;">${fmtCOP(r.amount)}</td>
      </tr>`;
    }).join('');
    installmentTableHtml = `
      <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
        <p style="color: #64748b; font-size: 12px; font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.05em;">Fechas de pago</p>
        <table style="width: 100%; border-collapse: collapse;">
          ${rows}
        </table>
      </div>`;
  }

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

      ${newStatus === 'rejected' && rejectionReason ? `
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <p style="color: #b91c1c; font-size: 13px; font-weight: bold; margin: 0 0 6px 0;">Motivo del rechazo</p>
        <p style="color: #991b1b; font-size: 14px; line-height: 1.5; margin: 0;">${rejectionReason}</p>
      </div>
      ` : ''}

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Monto solicitado</td>
          <td style="padding: 8px 0; color: #0f172a; font-size: 14px; text-align: right; font-weight: bold;">${amountFormatted}</td>
        </tr>
        ${typeof totalCliente === 'number' ? `
        <tr>
          <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Total a pagar</td>
          <td style="padding: 8px 0; color: #16a34a; font-size: 14px; text-align: right; font-weight: bold;">${fmtCOP(totalCliente)}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">No. solicitud</td>
          <td style="padding: 8px 0; color: #9ca3af; font-size: 12px; text-align: right;">${loanId.slice(0, 8)}...</td>
        </tr>
      </table>

      ${installmentTableHtml}

      ${proofUrl ? `
      <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <p style="color: #047857; font-size: 13px; font-weight: bold; margin: 0 0 6px 0;">💸 Comprobante de desembolso</p>
        <p style="color: #065f46; font-size: 13px; margin: 0 0 10px 0;">Adjuntamos el comprobante del desembolso a tu cuenta. También puedes descargarlo desde el siguiente enlace:</p>
        <a href="${proofUrl}" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 8px;">Ver comprobante</a>
      </div>
      ` : ''}

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
      ...(proofUrl
        ? { attachments: [{ filename: `comprobante-desembolso-${loanId.slice(0, 8)}.${(proofUrl.split('?')[0].split('.').pop() || 'pdf')}`, path: proofUrl }] }
        : {}),
    });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }

  // Push notification via Firebase Function (non-blocking, fire-and-forget)
  if (phone) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (projectId) {
      fetch(`https://us-central1-${projectId}.cloudfunctions.net/sendPushNotification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          title: `${config.icon} Solicitud ${config.label}`,
          body: newStatus === 'rejected' && rejectionReason ? `Motivo: ${rejectionReason}` : config.message,
        }),
      }).catch(() => {/* non-blocking */});
    }
  }

  return NextResponse.json({ success: true });
}
