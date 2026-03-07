import { NextRequest, NextResponse } from 'next/server';

interface ReminderPayload {
  phone: string;
  userName: string;
  message: string;
}

export async function POST(req: NextRequest) {
  const body: ReminderPayload = await req.json();
  const { phone, message } = body;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // sandbox por defecto

  if (!sid || !token) {
    return NextResponse.json(
      { success: false, error: 'Twilio no configurado. Agrega TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en .env.local' },
      { status: 500 }
    );
  }

  try {
    const twilio = require('twilio')(sid, token);
    // Formato E.164 con prefijo whatsapp:
    const rawPhone = phone.replace(/\s+/g, '');
    const to = `whatsapp:${rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`}`;
    await twilio.messages.create({ body: message, from, to });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
