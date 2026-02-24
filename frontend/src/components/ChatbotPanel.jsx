import { useEffect, useMemo, useRef, useState } from 'react';
import { askChatbot, fetchRuntimeConfig } from '../api/client';
import { useLanguage } from '../i18n/LanguageContext';

const SESSION_KEY = 'tirpe_chat_session_id';
const ROUTE_MODE_KEY = 'tirpe_chat_route_mode';

function initialSessionId() {
  try {
    return window.localStorage.getItem(SESSION_KEY) || '';
  } catch {
    return '';
  }
}

function initialRouteMode() {
  try {
    const stored = window.localStorage.getItem(ROUTE_MODE_KEY);
    if (stored === 'maps_strict' || stored === 'hybrid') {
      return stored;
    }
  } catch {
    // ignore storage errors
  }
  return 'hybrid';
}

function MessageBubble({ role, text }) {
  const isUser = role === 'user';
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser ? (
        <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold text-white">
          AI
        </span>
      ) : null}
      <div
        className={[
          'max-w-[88%] rounded-lg px-3 py-2 text-sm leading-relaxed',
          isUser ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-slate-50 text-slate-800',
        ].join(' ')}
      >
        {text}
      </div>
      {isUser ? (
        <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700">
          YOU
        </span>
      ) : null}
    </div>
  );
}

export function ChatbotPanel({ page, locationId, embedded = false }) {
  const { language, t } = useLanguage();
  const [runtimeConfig, setRuntimeConfig] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        t('chatbot.initial'),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [routeMode, setRouteMode] = useState(initialRouteMode);
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');

  const bottomRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function loadConfig() {
      try {
        const config = await fetchRuntimeConfig();
        if (active) {
          setRuntimeConfig(config);
        }
      } catch {
        if (active) {
          setRuntimeConfig({
            ai_provider: 'unknown',
            features: {
              chatbot_enabled: false,
            },
          });
        }
      } finally {
        if (active) {
          setConfigLoaded(true);
        }
      }
    }

    loadConfig();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ROUTE_MODE_KEY, routeMode);
    } catch {
      // ignore storage failure
    }
  }, [routeMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  useEffect(() => {
    if (!navigator?.geolocation) {
      setLocationStatus('unsupported');
      return;
    }

    let cancelled = false;
    setLocationStatus('resolving');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) {
          return;
        }

        setUserLocation({
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
          accuracy_m: Number(position.coords.accuracy || 0),
        });
        setLocationStatus('ready');
      },
      () => {
        if (!cancelled) {
          setLocationStatus('denied');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 7000,
        maximumAge: 120000,
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const chatbotEnabled = useMemo(() => {
    return Boolean(runtimeConfig?.features?.chatbot_enabled);
  }, [runtimeConfig]);

  async function handleSubmit(event) {
    event.preventDefault();

    const question = input.trim();
    if (!question || sending || !chatbotEnabled) {
      return;
    }

    setMessages((previous) => [...previous, { role: 'user', content: question }]);
    setInput('');
    setSending(true);

    try {
      const response = await askChatbot({
        message: question,
        session_id: sessionId || undefined,
        page,
        location_id: locationId || undefined,
        language,
        route_mode: routeMode,
        user_location: userLocation || undefined,
      });

      if (response.session_id && response.session_id !== sessionId) {
        setSessionId(response.session_id);
        try {
          window.localStorage.setItem(SESSION_KEY, response.session_id);
        } catch {
          // ignore storage failure
        }
      }

      setMessages((previous) => [...previous, { role: 'assistant', content: response.answer }]);
    } catch (error) {
      const message = error?.response?.data?.message
        || error?.response?.data?.error
        || error?.message
        || t('chatbot.error');

      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          content: `${t('chatbot.unable')} ${message}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const content = !configLoaded ? (
    <p className="text-sm text-slate-500">{t('chatbot.loadingConfig')}</p>
  ) : (
    <>
      <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">TIRPE Copilot</h3>
          <p className="text-[11px] text-slate-500">{t('chatbot.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setRouteMode((prev) => (prev === 'maps_strict' ? 'hybrid' : 'maps_strict'))}
            className={[
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
              routeMode === 'maps_strict'
                ? 'border-blue-300 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-600',
            ].join(' ')}
            title={t('chatbot.mapsModeHint')}
          >
            {t('chatbot.mapsMode')}: {routeMode === 'maps_strict' ? t('chatbot.mapsOn') : t('chatbot.mapsOff')}
          </button>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {runtimeConfig?.ai_provider || 'unknown'}
          </span>
        </div>
      </div>
      <div className="mb-2 text-[11px] text-slate-500">
        {t('chatbot.locationAssist')}: {locationStatus === 'ready' ? t('chatbot.locationOn') : locationStatus === 'resolving' ? t('chatbot.locationDetecting') : t('chatbot.locationOff')}
      </div>

      {!chatbotEnabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('chatbot.disabled')}
        </div>
      ) : (
        <>
          <div className="mb-3 h-[380px] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
            {messages.map((message, index) => (
              <MessageBubble key={`${message.role}-${index}`} role={message.role} text={message.content} />
            ))}
            {sending ? <p className="text-xs text-slate-500">{t('chatbot.generating')}</p> : null}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              placeholder={t('chatbot.placeholder')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('chatbot.send')}
            </button>
          </form>
        </>
      )}
    </>
  );

  if (embedded) {
    return <div>{content}</div>;
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-4">{content}</section>;
}
