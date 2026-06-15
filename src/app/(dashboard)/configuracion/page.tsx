'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const BANK_OPTIONS = [
  'Bancolombia',
  'Nequi',
  'Davivienda',
  'Daviplata',
  'Banco de Bogotá',
  'Banco de Occidente',
  'Banco Popular',
  'BBVA',
  'Banco Caja Social',
  'Scotiabank Colpatria',
  'Itaú',
  'Nu',
];

interface WompiConfig {
  publicKey: string;
  integrityKey: string;
  subscriptionAmount: number;
  transferBankName: string;
  transferAccountType: string;
  transferAccountNumber: string;
  transferKey: string;
  transferAccountHolder: string;
  transferAccountDocument: string;
  transferNotes: string;
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
    transferBankName: '',
    transferAccountType: '',
    transferAccountNumber: '',
    transferKey: '',
    transferAccountHolder: '',
    transferAccountDocument: '',
    transferNotes: '',
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
  const bankOptions = wompiConfig.transferBankName &&
    !BANK_OPTIONS.includes(wompiConfig.transferBankName)
    ? [wompiConfig.transferBankName, ...BANK_OPTIONS]
    : BANK_OPTIONS;

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
            transferBankName: d.transferBankName ?? '',
            transferAccountType: d.transferAccountType ?? '',
            transferAccountNumber: d.transferAccountNumber ?? '',
            transferKey: d.transferKey ?? '',
            transferAccountHolder: d.transferAccountHolder ?? '',
            transferAccountDocument: d.transferAccountDocument ?? '',
            transferNotes: d.transferNotes ?? '',
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
            interest: d.interest != null ? Math.round((d.interest - 1) * 100) : 20,
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
        transferBankName: wompiConfig.transferBankName.trim(),
        transferAccountType: wompiConfig.transferAccountType.trim(),
        transferAccountNumber: wompiConfig.transferAccountNumber.trim(),
        transferKey: wompiConfig.transferKey.trim(),
        transferAccountHolder: wompiConfig.transferAccountHolder.trim(),
        transferAccountDocument: wompiConfig.transferAccountDocument.trim(),
        transferNotes: wompiConfig.transferNotes.trim(),
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
        interest: 1 + Number(loanConfig.interest) / 100,
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
            <label className="block text-slate-700 text-sm font-medium mb-2">Interés (%)</label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min={0}
                max={100}
                value={loanConfig.interest}
                onChange={e => setLoanConfig(prev => ({ ...prev, interest: Number(e.target.value) }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-10 text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">%</span>
            </div>
            <p className="text-slate-400 text-xs mt-1">El cliente paga {loanConfig.interest}% adicional sobre el capital prestado</p>
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

      {/* Payment config */}
      <div>
        <h2 className="text-slate-700 text-base font-semibold mb-3">Configuración de pagos</h2>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="space-y-5">
            <div>
              <h3 className="text-slate-700 text-sm font-semibold mb-1">Pagos con Wompi</h3>
              <p className="text-slate-500 text-xs">Configuración del checkout principal de la plataforma.</p>
            </div>
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
          </div>

          <div className="pt-5 border-t border-slate-200 space-y-4">
            <div>
              <h3 className="text-slate-700 text-sm font-semibold mb-1">Pagos por transferencia manual</h3>
              <p className="text-slate-500 text-xs">
                Esta es una opción adicional a Wompi para usuarios que prefieran transferir y luego adjuntar su comprobante.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-700 text-sm font-medium mb-2">Banco</label>
                <select
                  value={wompiConfig.transferBankName}
                  onChange={e => setWompiConfig(prev => ({ ...prev, transferBankName: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
                >
                  <option value="">Selecciona un banco</option>
                  {bankOptions.map(bank => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-700 text-sm font-medium mb-2">Tipo de cuenta</label>
                <select
                  value={wompiConfig.transferAccountType}
                  onChange={e => setWompiConfig(prev => ({ ...prev, transferAccountType: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
                >
                  <option value="">Selecciona una opción</option>
                  <option value="Ahorros">Ahorros</option>
                  <option value="Corriente">Corriente</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-700 text-sm font-medium mb-2">Número de cuenta</label>
                <input
                  type="text"
                  value={wompiConfig.transferAccountNumber}
                  onChange={e => setWompiConfig(prev => ({ ...prev, transferAccountNumber: e.target.value }))}
                  placeholder="Número"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-slate-700 text-sm font-medium mb-2">Llave</label>
                <input
                  type="text"
                  value={wompiConfig.transferKey}
                  onChange={e => setWompiConfig(prev => ({ ...prev, transferKey: e.target.value }))}
                  placeholder="Texto alfanumérico"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-slate-700 text-sm font-medium mb-2">Titular</label>
                <input
                  type="text"
                  value={wompiConfig.transferAccountHolder}
                  onChange={e => setWompiConfig(prev => ({ ...prev, transferAccountHolder: e.target.value }))}
                  placeholder="Nombre del titular"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-slate-700 text-sm font-medium mb-2">Documento del titular</label>
              <input
                type="text"
                value={wompiConfig.transferAccountDocument}
                onChange={e => setWompiConfig(prev => ({ ...prev, transferAccountDocument: e.target.value }))}
                placeholder="CC / NIT"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
              />
            </div>

            <div className="mt-4">
              <label className="block text-slate-700 text-sm font-medium mb-2">Nota o instrucciones</label>
              <textarea
                value={wompiConfig.transferNotes}
                onChange={e => setWompiConfig(prev => ({ ...prev, transferNotes: e.target.value }))}
                placeholder="Ej: Envía el comprobante con el nombre y cédula del titular del crédito."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors resize-none"
              />
            </div>
          </div>

          <button
            onClick={handleSaveWompi}
            disabled={savingWompi}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingWompi ? 'Guardando...' : savedWompi ? '✓ Guardado' : 'Guardar configuración de pagos'}
          </button>
        </div>
      </div>

      <p className="text-slate-400 text-xs">
        Los cambios aplican inmediatamente en la app. Los montos de préstamos se actualizan al abrir la app.
      </p>
    </div>
  );
}
