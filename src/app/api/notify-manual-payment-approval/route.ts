import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

interface ManualPaymentApprovalPayload {
  paymentId: string;
  paymentType: 'subscription' | 'installment';
  amount: number;
  amountInCents?: number;
  userName: string;
  email?: string;
  phone?: string;
  loanId?: string | null;
  installmentNumber?: number | null;
  installmentsToPay?: number;
}

function formatCOP(amount: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildContent(payload: ManualPaymentApprovalPayload) {
  if (payload.paymentType === 'subscription') {
    return {
      subject: `✅ Suscripción activada · ${formatCOP(payload.amount)}`,
      title: '✅ Suscripción activada',
      badge: 'Suscripción manual aprobada',
      message:
        'Tu comprobante de suscripción fue aprobado. Ya puedes continuar con tu solicitud de crédito y usar las funcionalidades de la plataforma.',
      pushTitle: '✅ Suscripción activada',
      pushBody:
        'Aprobamos tu comprobante manual. Ya puedes continuar con tu solicitud de crédito.',
      extraRows: `
        <tr>
          <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Estado</td>
          <td style="padding: 8px 0; color: #16a34a; font-size: 14px; text-align: right; font-weight: bold;">Activa</td>
        </tr>
      `,
    };
  }

  const installmentsToPay = Math.max(payload.installmentsToPay || 1, 1);
  const quotaLabel = installmentsToPay === 1
    ? 'tu cuota fue aplicada'
    : `se aplicaron ${installmentsToPay} cuotas`;
  const installmentDetail = payload.installmentNumber
    ? `hasta la cuota ${payload.installmentNumber}`
    : `${installmentsToPay} cuota${installmentsToPay > 1 ? 's' : ''}`;

  return {
    subject: `✅ Pago aplicado · ${formatCOP(payload.amount)}`,
    title: '✅ Pago aprobado',
    badge: 'Pago manual de cuota(s) aprobado',
    message:
      `Tu comprobante de pago fue aprobado y ${quotaLabel}. El abono quedó registrado en tu crédito.`,
    pushTitle: '✅ Pago aplicado',
    pushBody:
      `Aprobamos tu comprobante manual y aplicamos ${installmentDetail} a tu crédito.`,
    extraRows: `
      <tr>
        <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Cuotas aplicadas</td>
        <td style="padding: 8px 0; color: #0f172a; font-size: 14px; text-align: right; font-weight: bold;">${installmentsToPay}</td>
      </tr>
      ${payload.installmentNumber ? `
      <tr>
        <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Aplicado hasta</td>
        <td style="padding: 8px 0; color: #0f172a; font-size: 14px; text-align: right;">Cuota ${payload.installmentNumber}</td>
      </tr>` : ''}
    `,
  };
}

export async function POST(req: NextRequest) {
  const body: ManualPaymentApprovalPayload = await req.json();
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const fromEmail = process.env.SMTP_FROM || smtpUser;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const content = buildContent(body);
  const displayName = body.userName || 'Cliente';

  if (body.email && smtpUser && smtpPass) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; color: #0f172a; border: 1px solid #e2e8f0;">
        <h2 style="color: #16a34a; margin: 0 0 8px 0; font-size: 20px;">${content.title}</h2>
        <p style="color: #9ca3af; margin: 0 0 24px 0; font-size: 13px;">Hola ${displayName}</p>

        <div style="background: #f0fdf4; border-radius: 12px; padding: 18px; margin-bottom: 20px; border: 1px solid #bbf7d0;">
          <p style="color: #15803d; font-size: 13px; font-weight: bold; margin: 0 0 4px 0;">${content.badge}</p>
          <p style="color: #166534; font-size: 14px; line-height: 1.6; margin: 0;">${content.message}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Valor aprobado</td>
            <td style="padding: 8px 0; color: #0f172a; font-size: 14px; text-align: right; font-weight: bold;">${formatCOP(body.amount)}</td>
          </tr>
          ${content.extraRows}
          <tr>
            <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Referencia</td>
            <td style="padding: 8px 0; color: #9ca3af; font-size: 12px; text-align: right;">${body.paymentId.slice(0, 8)}...</td>
          </tr>
        </table>

        <p style="margin-top: 24px; color: #6b7280; font-size: 11px; text-align: center;">
          El Desembale · Si no reconoces este cambio, contáctanos.
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
        to: body.email,
        subject: content.subject,
        html,
      });
    } catch (error) {
      console.error('manual payment approval email error', error);
    }
  }

  if (body.phone && projectId) {
    fetch(`https://us-central1-${projectId}.cloudfunctions.net/sendPushNotification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: body.phone,
        title: content.pushTitle,
        body: content.pushBody,
      }),
    }).catch((error) => {
      console.error('manual payment approval push error', error);
    });
  }

  return NextResponse.json({ success: true });
}
