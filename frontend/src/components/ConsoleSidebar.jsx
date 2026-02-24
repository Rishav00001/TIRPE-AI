import { useEffect, useState } from 'react';
import { fetchConsoleOverview } from '../api/client';
import { useLanguage } from '../i18n/LanguageContext';
import { sourceLabel, sourceTone } from '../utils/formatters';

function formatTime(value) {
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return '--';
  }
}

function levelClass(level) {
  const normalized = String(level || '').toUpperCase();
  if (normalized === 'ERROR') return 'bg-red-100 text-red-800';
  if (normalized === 'WARN' || normalized === 'WARNING') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-200 text-slate-700';
}

export function ConsoleSidebar() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    let timer;

    async function load() {
      try {
        const payload = await fetchConsoleOverview();
        if (active) {
          setData(payload);
          setError(null);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message || t('console.unavailable'));
        }
      } finally {
        if (active) {
          timer = setTimeout(load, 45000);
        }
      }
    }

    load();

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  return (
    <aside className="hidden border-l border-slate-200 bg-white p-5 xl:block">
      <h2 className="text-sm font-semibold text-slate-800">{t('console.title')}</h2>
      <p className="mt-1 text-xs text-slate-500">{t('console.subtitle')}</p>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      ) : null}

      <div className="mt-4 space-y-4">
        <section className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-500">{t('console.runtime')}</p>
          <p className="mt-1 text-sm text-slate-800">AI: {data?.runtime?.ai_provider || '--'}</p>
          <p className="text-xs text-slate-600">Model: {data?.runtime?.ai_model || '--'}</p>
          <p className="text-xs text-slate-600">{t('console.chatbot')}: {data?.runtime?.features?.chatbot_enabled ? t('common.on') : t('common.off')}</p>
        </section>

        <section className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-500">{t('console.topRisks')}</p>
          <div className="mt-2 space-y-2">
            {(data?.top_risks || []).slice(0, 3).map((item) => (
              <div key={item.location_id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                <p className="text-xs font-semibold text-slate-800">{item.location_name}</p>
                <p className="text-xs text-slate-600">{t('common.risk')} {item.risk_score.toFixed(1)} ({item.risk_level})</p>
                <p className="text-[11px] text-slate-500">{item.weather_condition} | {t('common.aqi')} {item.aqi}</p>
                <div className="mt-1">
                  <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${sourceTone(item.weather_source)}`}>
                    {sourceLabel(item.weather_source)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">{t('console.logs')}</p>
            <p className="text-[11px] text-slate-500">
              {data?.recent_logs?.length ?? 0} {t('console.recent')}
            </p>
          </div>
          <div className="max-h-[300px] space-y-2 overflow-y-auto">
            {(data?.recent_logs || []).slice(0, 10).map((log) => (
              <div key={`${log.timestamp}-${log.id}`} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${levelClass(log.level)}`}>{log.level}</span>
                  <span className="text-[10px] text-slate-500">{formatTime(log.timestamp)}</span>
                </div>
                <p className="text-xs text-slate-700">{log.message}</p>
                <p className="text-[10px] uppercase text-slate-500">{log.scope}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
