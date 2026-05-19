'use client';

import { useState } from 'react';
import { LoanInformation } from '@/lib/types';

interface Props {
  loanInfo: LoanInformation;
  onClose: () => void;
}

const TABS = [
  { key: 'ccFrontalPicture', label: 'CC Frontal' },
  { key: 'ccBackPicture', label: 'CC Trasera' },
  { key: 'selfiePicture', label: 'Selfie' },
  { key: 'empInvoiceFile', label: 'Comprobante' },
] as const;

export function LoanDocumentsDialog({ loanInfo, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['key']>('ccFrontalPicture');

  const currentUrl = loanInfo[activeTab];

  const isPdf = currentUrl?.toLowerCase().includes('.pdf') ||
    currentUrl?.toLowerCase().includes('application/pdf');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-200">
          <h2 className="text-slate-900 font-bold text-lg">Documentos</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-4 border-b border-slate-200 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[300px]">
          {currentUrl ? (
            isPdf ? (
              <iframe
                src={currentUrl}
                className="w-full h-full min-h-[400px] rounded-lg"
                title={activeTab}
              />
            ) : (
              <img
                src={currentUrl}
                alt={activeTab}
                className="max-w-full max-h-[500px] object-contain rounded-lg"
              />
            )
          ) : (
            <p className="text-slate-400">No hay documento disponible</p>
          )}
        </div>
      </div>
    </div>
  );
}
