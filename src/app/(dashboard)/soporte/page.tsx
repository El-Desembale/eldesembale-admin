'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  markSupportThreadSeenByAdmin,
  sendAdminSupportMessage,
  subscribeToSupportMessages,
  subscribeToSupportThreads,
  type SupportMessage,
  type SupportThread,
} from '@/lib/support';

function formatDate(date: Date | null) {
  if (!date) return 'Sin actividad';
  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sourceLabel(sources: string[]) {
  const hasWeb = sources.includes('web_app');
  const hasApp = sources.includes('mobile_app');
  if (hasWeb && hasApp) return 'App + Web';
  if (hasApp) return 'App';
  return 'Web';
}

export default function SupportPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = subscribeToSupportThreads(setThreads);
    return () => unsub();
  }, []);

  const filteredThreads = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return threads;
    return threads.filter((thread) =>
      [thread.customerName, thread.customerPhone, thread.customerEmail, thread.lastMessagePreview]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [search, threads]);

  useEffect(() => {
    if (!selectedId && filteredThreads[0]?.id) setSelectedId(filteredThreads[0].id);
    if (selectedId && !filteredThreads.some((thread) => thread.id === selectedId)) {
      setSelectedId(filteredThreads[0]?.id || '');
    }
  }, [filteredThreads, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    const unsub = subscribeToSupportMessages(selectedId, setMessages);
    markSupportThreadSeenByAdmin(selectedId).catch(() => undefined);
    return () => unsub();
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!selectedId || messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.senderRole === 'customer') {
      markSupportThreadSeenByAdmin(selectedId).catch(() => undefined);
    }
  }, [messages, selectedId]);

  const selectedThread = filteredThreads.find((thread) => thread.id === selectedId) || null;

  const handleSend = async () => {
    if (!selectedThread || !draft.trim()) return;
    setSending(true);
    setError('');
    try {
      await sendAdminSupportMessage({
        threadId: selectedThread.id,
        text: draft,
        adminName: user?.email || 'Admin',
      });
      setDraft('');
    } catch {
      setError('No se pudo enviar la respuesta.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Soporte
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-900">
              Bandeja de chats de ayuda
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Aquí aparecen los mensajes enviados desde la web app y la app móvil. Puedes abrir un
              hilo, revisar el historial y responderle al cliente desde el admin.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Conversaciones
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-slate-900">
              {threads.length}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {threads.filter((thread) => thread.adminUnreadCount > 0).length} con mensajes nuevos
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, teléfono o mensaje"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white"
            />
          </div>
          <div className="max-h-[72vh] overflow-y-auto p-3">
            {filteredThreads.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 px-5 py-12 text-center text-sm leading-6 text-slate-500">
                Todavía no hay chats de soporte.
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const active = thread.id === selectedId;
                return (
                  <button
                    key={thread.id}
                    onClick={() => setSelectedId(thread.id)}
                    className={`mb-3 w-full rounded-[24px] border p-4 text-left transition ${
                      active
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {thread.customerName || 'Cliente sin nombre'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{thread.customerPhone}</p>
                      </div>
                      {thread.adminUnreadCount > 0 && (
                        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-500 px-2 py-1 text-[11px] font-semibold text-white">
                          {thread.adminUnreadCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-5 text-slate-600">
                      {thread.lastMessagePreview || 'Sin mensajes todavía'}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      <span>{sourceLabel(thread.sourcePlatforms)}</span>
                      <span>{formatDate(thread.lastMessageAt)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          {selectedThread ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {selectedThread.customerName || 'Cliente sin nombre'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedThread.customerPhone}
                    {selectedThread.customerEmail ? ` · ${selectedThread.customerEmail}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedThread.sourcePlatforms.map((source) => (
                    <span
                      key={source}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
                    >
                      {source === 'mobile_app' ? 'App' : 'Web'}
                    </span>
                  ))}
                </div>
              </div>

              <div className="max-h-[58vh] overflow-y-auto bg-slate-50/70 px-5 py-6">
                {messages.map((message) => {
                  const isAdmin = message.senderRole === 'admin';
                  return (
                    <div
                      key={message.id}
                      className={`mb-4 flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-[22px] px-4 py-3 shadow-sm ${
                          isAdmin
                            ? 'bg-blue-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-800'
                        }`}
                      >
                        <p className={`text-xs ${isAdmin ? 'text-blue-100' : 'text-slate-500'}`}>
                          {isAdmin ? message.senderName || 'Admin' : message.senderName || 'Cliente'}
                        </p>
                        <p className="mt-2 text-sm leading-6">{message.text}</p>
                        <p className={`mt-3 text-[11px] ${isAdmin ? 'text-blue-100' : 'text-slate-400'}`}>
                          {formatDate(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-slate-200 p-5">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={4}
                  placeholder="Escribe una respuesta para el cliente"
                  className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white"
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className={`text-sm ${error ? 'text-rose-500' : 'text-slate-500'}`}>
                    {error || 'La respuesta aparecerá en el chat del usuario.'}
                  </p>
                  <button
                    onClick={handleSend}
                    disabled={!draft.trim() || sending}
                    className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    {sending ? 'Enviando...' : 'Responder'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="grid min-h-[60vh] place-items-center px-6 text-center">
              <div>
                <p className="text-lg font-semibold text-slate-900">Selecciona una conversación</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Elige un chat de la bandeja para ver el historial y responder.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
