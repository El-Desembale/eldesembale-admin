import { NextRequest, NextResponse } from 'next/server';

interface ReminderPayload {
  phone: string;
  email?: string;
  userName: string;
  message: string;
  channels: ('sms' | 'email')[];
}

export async function POST(req: NextRequest) {
  const body: ReminderPayload = await req.json();
  const { phone, email, userName, message, channels } = body;

  const results: { channel: string; success: boolean; error?: string }[] = [];

  // SMS via Twilio
  if (channels.includes('sms')) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!sid || !token || !from) {
      results.push({ channel: 'sms', success: false, error: 'Twilio no configurado (faltan TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER en .env.local)' });
    } else {
      try {
        const twilio = require('twilio')(sid, token);
        // Ensure E.164 format (+57XXXXXXXXXX)
        const to = phone.startsWith('+') ? phone : `+${phone}`;
        await twilio.messages.create({ body: message, from, to });
        results.push({ channel: 'sms', success: true });
      } catch (e: unknown) {
        results.push({ channel: 'sms', success: false, error: (e as Error).message });
      }
    }
  }

  // Email via Resend
  if (channels.includes('email')) {
    if (!email) {
      results.push({ channel: 'email', success: false, error: 'El usuario no tiene email registrado' });
    } else {
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.RESEND_FROM_EMAIL || 'recordatorio@eldesembale.com';

      if (!apiKey) {
        results.push({ channel: 'email', success: false, error: 'Resend no configurado (falta RESEND_API_KEY en .env.local)' });
      } else {
        try {
          const { Resend } = require('resend');
          const resend = new Resend(apiKey);
          await resend.emails.send({
            from,
            to: email,
            subject: 'Recordatorio de pago — El Desembale',
            html: `
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                <h2 style="color:#061006">El Desembale</h2>
                <p>Hola <strong>${userName}</strong>,</p>
                <p>${message}</p>
                <p style="color:#888;font-size:12px;margin-top:32px">Este es un mensaje automático. Por favor no respondas a este correo.</p>
              </div>
            `,
          });
          results.push({ channel: 'email', success: true });
        } catch (e: unknown) {
          results.push({ channel: 'email', success: false, error: (e as Error).message });
        }
      }
    }
  }

  const allOk = results.every(r => r.success);
  return NextResponse.json({ results }, { status: allOk ? 200 : 207 });
}
