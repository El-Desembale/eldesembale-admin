'use client';

import { useState } from 'react';

interface Props {
  email: string;
  userName: string;
  daysOverdue: number;
  onClose: () => void;
}

const DEFAULT_MESSAGE = (name: string, days: number) =>
  `Hola ${name}, te recordamos que tienes ${days} día${days !== 1 ? 's' : ''} de mora en tu préstamo con El Desembale. Por favor comunícate con nosotros para ponerte al día y evitar cargos adicionales. ¡Gracias!`;

export function ReminderDialog({ email, userName, daysOverdue, onClose }: Props) {
  const [message, setMessage] = useState(DEFAULT_MESSAGE(userName || 'cliente', daysOverdue));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, userName, message }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: 'Error de red al enviar' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg flex flex-col gap-4 p-6 shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✉️</span>
            <h2 className="text-slate-900 font-bold text-lg">Recordatorio por correo</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        {/* Client info */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-1">
          <p className="text-slate-500">Cliente: <span className="text-slate-900 font-medium">{userName || '—'}</span></p>
          <p className="text-slate-500">Correo: <span className="text-slate-900">{email || 'No registrado'}</span></p>
          <p className="text-orange-500 font-medium">{daysOverdue} días en mora</p>
        </div>

        {/* Message */}
        <div>
          <p className="text-slate-700 text-sm font-medium mb-2">Mensaje:</p>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={5}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors resize-none"
          />
          <p className="text-slate-400 text-xs mt-1">{message.length} caracteres</p>
        </div>

        {/* Result */}
        {result && (
          <div className={`px-4 py-3 rounded-xl text-sm ${
            result.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            {result.success
              ? 'Correo enviado correctamente'
              : `Error: ${result.error}`}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {result?.success ? 'Cerrar' : 'Cancelar'}
          </button>
          {!result?.success && (
            <button
              onClick={handleSend}
              disabled={sending || !message.trim() || !email}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Enviando...' : 'Enviar correo'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
