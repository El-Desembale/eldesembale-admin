import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

interface NewLoanPayload {
  loanId: string;
  amount: number;
  phone: string;
  installments: number;
  paymentPeriod: string;
  interest?: number;
  createdAt?: string;
  clientName?: string;
  /** Montos por cuota (modelo nuevo, incluye Wompi). */
  installmentAmounts?: number[];
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

export async function POST(req: NextRequest) {
  const body: NewLoanPayload = await req.json();
  const { loanId, amount, phone, installments, paymentPeriod, interest, createdAt, clientName, installmentAmounts, totalCliente } = body;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const fromEmail = process.env.SMTP_FROM || smtpUser;
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

  if (!smtpUser || !smtpPass || adminEmails.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Email no configurado. Agrega SMTP_USER, SMTP_PASS y ADMIN_EMAILS en .env.local' },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const amountFormatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);

  const clientDisplay = clientName ? `${clientName} (${phone})` : phone;
  const loanUrl = `https://eldesembale-admin.vercel.app/solicitudes/${loanId}`;

  const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

  const base = createdAt ? new Date(createdAt) : new Date();
  const hasPricing = Array.isArray(installmentAmounts) && installmentAmounts.length > 0;
  const legacyAmount = interest && installments > 0
    ? ((amount * interest) - amount + (amount / installments))
    : (installments > 0 ? amount / installments : 0);
  // Modelo nuevo: usar montos por cuota del desglose; si no, fallback al cálculo previo.
  const perCuota = (i: number) => (hasPricing ? installmentAmounts![i] : legacyAmount);
  const installmentAmountFmt = fmtCOP(perCuota(0));

  const installmentRows = Array.from({ length: installments }, (_, i) => {
    const d = calcInstallmentDate(base, i, paymentPeriod);
    const dateStr = d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    return `<tr>
      <td style="padding: 6px 8px; color: #64748b; font-size: 13px;">Cuota ${i + 1}</td>
      <td style="padding: 6px 8px; color: #0f172a; font-size: 13px; text-align: center;">${dateStr}</td>
      <td style="padding: 6px 8px; color: #2563eb; font-size: 13px; text-align: right; font-weight: bold;">${fmtCOP(perCuota(i))}</td>
    </tr>`;
  }).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; color: #0f172a; border: 1px solid #e2e8f0;">
      <h2 style="color: #2563eb; margin: 0 0 8px 0; font-size: 20px;">🔔 Nueva solicitud de préstamo</h2>
      <p style="color: #9ca3af; margin: 0 0 24px 0; font-size: 13px;">Se ha recibido una nueva solicitud</p>
      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
        <p style="color: #9ca3af; font-size: 13px; margin: 0 0 4px 0;">Monto solicitado</p>
        <p style="color: #2563eb; font-size: 26px; font-weight: bold; margin: 0;">${amountFormatted}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Cliente</td>
          <td style="padding: 8px 0; color: #0f172a; font-size: 14px; text-align: right; font-weight: bold;">${clientDisplay}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Cuotas</td>
          <td style="padding: 8px 0; color: #0f172a; font-size: 14px; text-align: right;">${installments} cuotas · ${paymentPeriod}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Valor por cuota</td>
          <td style="padding: 8px 0; color: #0f172a; font-size: 14px; text-align: right; font-weight: bold;">${installmentAmountFmt}</td>
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
      <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
        <p style="color: #64748b; font-size: 12px; font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.05em;">Fechas de pago</p>
        <table style="width: 100%; border-collapse: collapse;">
          ${installmentRows}
        </table>
      </div>
      <div style="text-align: center;">
        <a href="${loanUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 32px; border-radius: 24px; text-decoration: none; font-weight: bold; font-size: 14px;">
          Ver solicitud
        </a>
      </div>
      <p style="margin-top: 24px; color: #6b7280; font-size: 11px; text-align: center;">El Desembale · Panel de administración</p>
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
      to: adminEmails.join(', '),
      subject: `Nueva solicitud · ${clientDisplay} · ${amountFormatted}`,
      html,
    });

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500, headers: CORS_HEADERS });
  }
}
