import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchLocations } from '../api/client';
import { AsyncState } from '../components/AsyncState';
import { ChatbotPanel } from '../components/ChatbotPanel';
import { Panel } from '../components/Panel';
import { useLanguage } from '../i18n/LanguageContext';

export function AnalyticsChatPage() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const queryLocationId = Number(searchParams.get('location') || 0);
  const [selectedLocationId, setSelectedLocationId] = useState(queryLocationId || null);

  useEffect(() => {
    let cancelled = false;

    async function loadLocations() {
      try {
        const rows = await fetchLocations();
        if (!cancelled) {
          setLocations(rows);
          setError(null);

          if (!selectedLocationId && rows.length) {
            const firstId = rows[0].id;
            setSelectedLocationId(firstId);
            setSearchParams({ location: String(firstId) }, { replace: true });
          }
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'Failed to load locations');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLocations();

    return () => {
      cancelled = true;
    };
  }, [setSearchParams]);

  const selectedLabel = useMemo(() => {
    const match = locations.find((item) => item.id === selectedLocationId);
    return match?.name || t('analytics.selectLocation');
  }, [locations, selectedLocationId]);

  function onSelectLocation(value) {
    const locationId = Number(value);
    setSelectedLocationId(locationId);
    setSearchParams({ location: String(locationId) });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('analyticsChat.title')}</h1>
          <p className="text-sm text-slate-600">{t('analyticsChat.subtitle')}</p>
        </div>

        <Link
          to="/analytics"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t('analyticsChat.back')}
        </Link>
      </header>

      <AsyncState loading={loading} error={error}>
        <Panel
          title={t('analyticsChat.contextTitle')}
          subtitle={t('analyticsChat.contextSub')}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              {t('analytics.location')}
              <select
                value={selectedLocationId ?? ''}
                onChange={(event) => onSelectLocation(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {locations.map((location) => (
                  <option value={location.id} key={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>

            <p className="text-sm text-slate-600">{t('analyticsChat.currentContext')}: <span className="font-semibold text-slate-800">{selectedLabel}</span></p>
          </div>
        </Panel>
      </AsyncState>

      <section>
        <ChatbotPanel page="analytics" locationId={selectedLocationId} />
      </section>
    </div>
  );
}
