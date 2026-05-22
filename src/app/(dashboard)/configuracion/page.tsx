'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface WompiConfig {
  publicKey: string;
  integrityKey: string;
  subscriptionAmount: number;
}

interface LoanConfig {
  minAmount: number;
  maxAmount: number;
  minInstallments: number;
  maxInstallments: number;
  interest: number;
  docId?: string;
}

export default function ConfiguracionPage() {
  const [wompiConfig, setWompiConfig] = useState<WompiConfig>({
    publicKey: '',
    integrityKey: '',
    subscriptionAmount: 22000,
  });
  const [loanConfig, setLoanConfig] = useState<LoanConfig>({
    minAmount: 50000,
    maxAmount: 1000000,
    minInstallments: 2,
    maxInstallments: 8,
    interest: 10,
  });
  const [loading, setLoading] = useState(true);
  const [savingWompi, setSavingWompi] = useState(false);
  const [savingLoan, setSavingLoan] = useState(false);
  const [savedWompi, setSavedWompi] = useState(false);
  const [savedLoan, setSavedLoan] = useState(false);

  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const [wompiSnap, loanSnap] = await Promise.all([
          getDoc(doc(db, 'config', 'wompi')),
          getDocs(collection(db, 'app_config')),
        ]);

        if (wompiSnap.exists()) {
          const d = wompiSnap.data();
          setWompiConfig({
            publicKey: d.publicKey ?? '',
            integrityKey: d.integrityKey ?? '',
            subscriptionAmount: d.subscriptionAmount ?? 22000,
          });
        }

        if (!loanSnap.empty) {
          const loanDoc = loanSnap.docs[0];
          const d = loanDoc.data();
          setLoanConfig({
            minAmount: d.min_amount ?? 50000,
            maxAmount: d.max_amount ?? 1000000,
            minInstallments: d.number_min_of_installments ?? 2,
            maxInstallments: d.number_max_of_installments ?? 8,
            interest: d.interest ?? 10,
            docId: loanDoc.id,
          });
        }
      } catch (e) {
        console.error('Error cargando config:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchConfigs();
  }, []);

  const handleSaveWompi = async () => {
    setSavingWompi(true);
    setSavedWompi(false);
    try {
      await setDoc(doc(db, 'config', 'wompi'), {
        publicKey: wompiConfig.publicKey.trim(),
        integrityKey: wompiConfig.integrityKey.trim(),
        subscriptionAmount: Number(wompiConfig.subscriptionAmount),
        updatedAt: new Date(),
      });
      setSavedWompi(true);
      setTimeout(() => setSavedWompi(false), 3000);
    } catch (e) {
      console.error('Error guardando config Wompi:', e);
    } finally {
      setSavingWompi(false);
    }
  };

  const handleSaveLoan = async () => {
    setSavingLoan(true);
    setSavedLoan(false);
    try {
      const payload = {
        min_amount: Number(loanConfig.minAmount),
        max_amount: Number(loanConfig.maxAmount),
        number_min_of_installments: Number(loanConfig.minInstallments),
        number_max_of_installments: Number(loanConfig.maxInstallments),
        interest: Number(loanConfig.interest),
        updatedAt: new Date(),
      };
      if (loanConfig.docId) {
        await updateDoc(doc(db, 'app_config', loanConfig.docId), payload);
      } else {
        await setDoc(doc(db, 'app_config', 'main'), payload);
        setLoanConfig(prev => ({ ...prev, docId: 'main' }));
      }
      setSavedLoan(true);
      setTimeout(() => setSavedLoan(false), 3000);
    } catch (e) {
      console.error('Error guardando config préstamos:', e);
    } finally {
      setSavingLoan(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-8">
      <div className="mb-2">
        <h1 className="text-slate-900 text-2xl font-bold">Configuración</h1>
        <p className="text-slate-500 text-sm mt-1">Parámetros de préstamos y pagos</p>
      </div>

      {/* Loan config */}
      <div>
        <h2 className="text-slate-700 text-base font-semibold mb-3">Parámetros de préstamos</h2>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 text-sm font-medium mb-2">Monto mínimo (COP)</label>
              <input
                type="number"
                value={loanConfig.minAmount}
                onChange={e => setLoanConfig(prev => ({ ...prev, minAmount: Number(e.target.value) }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
              />
              <p className="text-slate-400 text-xs mt-1">${Number(loanConfig.minAmount).toLocaleString('es-CO')}</p>
            </div>
            <div>
              <label className="block text-slate-700 text-sm font-medium mb-2">Monto máximo (COP)</label>
              <input
                type="number"
                value={loanConfig.maxAmount}
                onChange={e => setLoanConfig(prev => ({ ...prev, maxAmount: Number(e.target.value) }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
              />
              <p className="text-slate-400 text-xs mt-1">${Number(loanConfig.maxAmount).toLocaleString('es-CO')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 text-sm font-medium mb-2">Cuotas mínimas</label>
              <input
                type="number"
                min={1}
                max={24}
                value={loanConfig.minInstallments}
                onChange={e => setLoanConfig(prev => ({ ...prev, minInstallments: Number(e.target.value) }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-slate-700 text-sm font-medium mb-2">Cuotas máximas</label>
              <input
                type="number"
                min={1}
                max={24}
                value={loanConfig.maxInstallments}
                onChange={e => setLoanConfig(prev => ({ ...prev, maxInstallments: Number(e.target.value) }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 text-sm font-medium mb-2">Interés (multiplicador)</label>
            <input
              type="number"
              step="0.1"
              min={1}
              value={loanConfig.interest}
              onChange={e => setLoanConfig(prev => ({ ...prev, interest: Number(e.target.value) }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
            />
            <p className="text-slate-400 text-xs mt-1">Valor actual: {loanConfig.interest}x (el cliente paga {loanConfig.interest}x el capital)</p>
          </div>

          <button
            onClick={handleSaveLoan}
            disabled={savingLoan}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingLoan ? 'Guardando...' : savedLoan ? '✓ Guardado' : 'Guardar parámetros'}
          </button>
        </div>
      </div>

      {/* Wompi config */}
      <div>
        <h2 className="text-slate-700 text-base font-semibold mb-3">Configuración Wompi</h2>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
          <div>
            <label className="block text-slate-700 text-sm font-medium mb-2">Llave pública (Public Key)</label>
            <input
              type="text"
              value={wompiConfig.publicKey}
              onChange={e => setWompiConfig(prev => ({ ...prev, publicKey: e.target.value }))}
              placeholder="pub_prod_..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-slate-700 text-sm font-medium mb-2">Llave de integridad (Integrity Key)</label>
            <input
              type="password"
              value={wompiConfig.integrityKey}
              onChange={e => setWompiConfig(prev => ({ ...prev, integrityKey: e.target.value }))}
              placeholder="••••••••••••••••"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-slate-700 text-sm font-medium mb-2">Valor suscripción (COP)</label>
            <input
              type="number"
              value={wompiConfig.subscriptionAmount}
              onChange={e => setWompiConfig(prev => ({ ...prev, subscriptionAmount: Number(e.target.value) }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
            />
            <p className="text-slate-400 text-xs mt-1">
              Valor actual: ${wompiConfig.subscriptionAmount.toLocaleString('es-CO')} COP
            </p>
          </div>

          <button
            onClick={handleSaveWompi}
            disabled={savingWompi}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingWompi ? 'Guardando...' : savedWompi ? '✓ Guardado' : 'Guardar Wompi'}
          </button>
        </div>
      </div>

      <p className="text-slate-400 text-xs">
        Los cambios aplican inmediatamente en la app. Los montos de préstamos se actualizan al abrir la app.
      </p>
    </div>
  );
}
