'use client';

import { useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

interface Props {
  loanId: string;
  amount: number;
  userName: string;
  email: string;
  onConfirm: (proofUrl: string) => Promise<void>;
  onClose: () => void;
}

const formatCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

export function DisbursementDialog({ loanId, amount, userName, email, onConfirm, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!file) {
      setError('Adjunta el comprobante de pago antes de continuar.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const path = `disbursements/${loanId}/comprobante_${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await onConfirm(url);
    } catch (e) {
      console.error('disbursement upload error', e);
      setError('No se pudo subir el comprobante. Intenta de nuevo.');
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg flex flex-col gap-4 p-6 shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💸</span>
            <h2 className="text-slate-900 font-bold text-lg">Desembolsar préstamo</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        {/* Info */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-1">
          <p className="text-slate-500">Cliente: <span className="text-slate-900 font-medium">{userName || '—'}</span></p>
          <p className="text-slate-500">Correo: <span className="text-slate-900">{email || 'No registrado'}</span></p>
          <p className="text-slate-500">Monto: <span className="text-emerald-600 font-semibold">{formatCOP(amount)}</span></p>
        </div>

        {/* File upload */}
        <div>
          <p className="text-slate-700 text-sm font-medium mb-2">Comprobante de pago</p>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl px-4 py-8 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors">
            <span className="text-3xl">{file ? '📄' : '⬆️'}</span>
            {file ? (
              <span className="text-slate-900 text-sm font-medium">{file.name}</span>
            ) : (
              <>
                <span className="text-slate-700 text-sm font-medium">Selecciona un archivo</span>
                <span className="text-slate-400 text-xs">PDF, JPG o PNG · máx. 10MB</span>
              </>
            )}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                if (f && f.size > 10 * 1024 * 1024) {
                  setError('El archivo supera los 10MB.');
                  return;
                }
                setError(null);
                setFile(f);
              }}
            />
          </label>
          <p className="text-slate-400 text-xs mt-2">
            El comprobante se enviará por correo al cliente junto con la notificación de desembolso.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-xl text-sm bg-red-50 text-red-600 border border-red-200">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={uploading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={uploading || !file}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Procesando...' : 'Confirmar desembolso'}
          </button>
        </div>
      </div>
    </div>
  );
}
