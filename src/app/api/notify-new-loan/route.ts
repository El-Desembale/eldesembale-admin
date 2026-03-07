import { NextRequest, NextResponse } from 'next/server';

interface NewLoanPayload {
  loanId: string;
  amount: number;
  phone: string;
  installments: number;
  paymentPeriod: string;
  clientName?: string;
}

export async function POST(req: NextRequest) {
  const body: NewLoanPayload = await req.json();
  const { loanId, amount, phone, installments, paymentPeriod, clientName } = body;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
  // Soporta múltiples números separados por coma
  const adminPhones = (process.env.ADMIN_WHATSAPP_NUMBERS || '').split(',').map(n => n.trim()).filter(Boolean);

  if (!sid || !token || adminPhones.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Twilio o números de admin no configurados' },
      { status: 500 }
    );
  }

  const amountFormatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);

  const clientDisplay = clientName ? `${clientName} (${phone})` : phone;
  const message =
    `🆕 *Nueva solicitud de préstamo*\n\n` +
    `👤 Cliente: ${clientDisplay}\n` +
    `💰 Monto: ${amountFormatted}\n` +
    `📅 ${installments} cuotas · ${paymentPeriod}\n\n` +
    `Ver solicitud:\nhttps://eldesembale-admin.vercel.app/solicitudes/${loanId}`;

  try {
    const twilio = require('twilio')(sid, token);
    await Promise.all(
      adminPhones.map((adminPhone) => {
        const to = `whatsapp:${adminPhone.startsWith('+') ? adminPhone : `+${adminPhone}`}`;
        return twilio.messages.create({ body: message, from, to });
      })
    );
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
