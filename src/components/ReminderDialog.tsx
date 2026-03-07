'use client';

import { useState } from 'react';

interface Props {
  phone: string;
  email?: string;
  userName: string;
  daysOverdue: number;
  onClose: () => void;
}

const DEFAULT_MESSAGE = (name: string, days: number) =>
  `Hola ${name}, te recordamos que tienes ${days} día${days !== 1 ? 's' : ''} de mora en tu préstamo con El Desembale. Por favor comunícate con nosotros para ponerte al día y evitar cargos adicionales. ¡Gracias!`;

export function ReminderDialog({ phone, email, userName, daysOverdue, onClose }: Props) {
  const [channels, setChannels] = useState<Set<'sms' | 'email'>>(new Set(['sms']));
  const [message, setMessage] = useState(DEFAULT_MESSAGE(userName || 'cliente', daysOverdue));
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ channel: string; success: boolean; error?: string }[] | null>(null);

  const toggleChannel = (ch: 'sms' | 'email') => {
    setChannels(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });
  };

  const handleSend = async () => {
    if (channels.size === 0) return;
    setSending(true);
    setResults(null);
    try {
      const res = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          email,
          userName,
          message,
          channels: Array.from(channels),
        }),
      });
      const data = await res.json();
      setResults(data.results);
    } catch {
      setResults([{ channel: 'general', success: false, error: 'Error de red al enviar' }]);
    } finally {
      setSending(false);
    }
  };

  const allSent = results?.every(r => r.success);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0a1a0a] border border-orange-500/30 rounded-2xl w-full max-w-lg flex flex-col gap-4 p-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-white font-bold text-lg">Enviar recordatorio</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Client info */}
        <div className="bg-[#061006] rounded-xl p-4 text-sm space-y-1">
          <p className="text-gray-400">Cliente: <span className="text-white font-medium">{userName || '—'}</span></p>
          <p className="text-gray-400">Teléfono: <span className="text-white">{phone}</span></p>
          {email && <p className="text-gray-400">Email: <span className="text-white">{email}</span></p>}
          <p className="text-orange-400 font-medium">{daysOverdue} días en mora</p>
        </div>

        {/* Channel selection */}
        <div>
          <p className="text-gray-300 text-sm font-medium mb-2">Enviar por:</p>
          <div className="flex gap-3">
            <button
              onClick={() => toggleChannel('sms')}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                channels.has('sms')
                  ? 'bg-orange-500/20 border-orange-500/60 text-orange-300'
                  : 'bg-[#061006] border-white/10 text-gray-500'
              }`}
            >
              📱 SMS
            </button>
            <button
              onClick={() => toggleChannel('email')}
              disabled={!email}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                channels.has('email')
                  ? 'bg-orange-500/20 border-orange-500/60 text-orange-300'
                  : 'bg-[#061006] border-white/10 text-gray-500'
              }`}
            >
              ✉️ Email {!email && '(sin email)'}
            </button>
          </div>
        </div>

        {/* Message */}
        <div>
          <p className="text-gray-300 text-sm font-medium mb-2">Mensaje:</p>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={4}
            className="w-full bg-[#061006] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500/60 transition-colors resize-none"
          />
          <p className="text-gray-600 text-xs mt-1">{message.length} caracteres{channels.has('sms') && message.length > 160 && ' · El SMS se dividirá en múltiples mensajes'}</p>
        </div>

        {/* Results */}
        {results && (
          <div className="space-y-2">
            {results.map(r => (
              <div
                key={r.channel}
                className={`px-4 py-2 rounded-xl text-sm ${
                  r.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                }`}
              >
                {r.success ? '✓' : '✗'} {r.channel.toUpperCase()}: {r.success ? 'Enviado correctamente' : r.error}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-white/10 text-gray-400 hover:text-white transition-colors"
          >
            {allSent ? 'Cerrar' : 'Cancelar'}
          </button>
          {!allSent && (
            <button
              onClick={handleSend}
              disabled={sending || channels.size === 0}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Enviando...' : 'Enviar recordatorio'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
