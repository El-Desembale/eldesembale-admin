'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface WompiConfig {
  publicKey: string;
  integrityKey: string;
  subscriptionAmount: number;
}

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<WompiConfig>({
    publicKey: '',
    integrityKey: '',
    subscriptionAmount: 22000,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'wompi'));
        if (snap.exists()) {
          const data = snap.data();
          setConfig({
            publicKey: data.publicKey ?? '',
            integrityKey: data.integrityKey ?? '',
            subscriptionAmount: data.subscriptionAmount ?? 22000,
          });
        }
      } catch (e) {
        console.error('Error cargando config:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await setDoc(doc(db, 'config', 'wompi'), {
        publicKey: config.publicKey.trim(),
        integrityKey: config.integrityKey.trim(),
        subscriptionAmount: Number(config.subscriptionAmount),
        updatedAt: new Date(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Error guardando config:', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-[#2FFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">Configuración</h1>
        <p className="text-gray-400 text-sm mt-1">Parámetros de Wompi y pagos</p>
      </div>

      <div className="bg-[#0d1f0d] border border-[#2FFF00]/20 rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-gray-400 text-sm mb-2">Llave pública (Public Key)</label>
          <input
            type="text"
            value={config.publicKey}
            onChange={e => setConfig(prev => ({ ...prev, publicKey: e.target.value }))}
            placeholder="pub_test_..."
            className="w-full bg-[#061006] border border-[#2FFF00]/20 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#2FFF00]/60 transition-colors font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-gray-400 text-sm mb-2">Llave de integridad (Integrity Key)</label>
          <input
            type="password"
            value={config.integrityKey}
            onChange={e => setConfig(prev => ({ ...prev, integrityKey: e.target.value }))}
            placeholder="••••••••••••••••"
            className="w-full bg-[#061006] border border-[#2FFF00]/20 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#2FFF00]/60 transition-colors font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-gray-400 text-sm mb-2">Valor suscripción (COP)</label>
          <input
            type="number"
            value={config.subscriptionAmount}
            onChange={e => setConfig(prev => ({ ...prev, subscriptionAmount: Number(e.target.value) }))}
            className="w-full bg-[#061006] border border-[#2FFF00]/20 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#2FFF00]/60 transition-colors"
          />
          <p className="text-gray-600 text-xs mt-1">
            Valor actual: ${config.subscriptionAmount.toLocaleString('es-CO')} COP
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#2FFF00] text-black font-semibold py-3 rounded-xl hover:bg-[#2FFF00]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
        </button>
      </div>

      <p className="text-gray-600 text-xs mt-4">
        Los cambios aplican inmediatamente en la app. Las llaves se guardan de forma segura en Firestore.
      </p>
    </div>
  );
}
