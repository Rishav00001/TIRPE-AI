import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Link, useNavigate } from 'react-router-dom';
import { fetchDashboardData } from '../api/client';
import { AsyncState } from '../components/AsyncState';
import { KpiCard } from '../components/KpiCard';
import { Panel } from '../components/Panel';
import { RiskMap } from '../components/RiskMap';
import { StatusPill } from '../components/StatusPill';
import { CapacityComparisonChart } from '../components/charts/CapacityComparisonChart';
import { RiskTrendChart } from '../components/charts/RiskTrendChart';
import { aqiTone, formatNumber, sourceLabel, sourceTone } from '../utils/formatters';
import { useLanguage } from '../i18n/LanguageContext';

function getTone(score) {
  if (score > 70) return 'danger';
  if (score >= 40) return 'warning';
  return 'success';
}

function crowdForecastMeta(value) {
  const chance = Number(value || 0);
  if (chance >= 75) {
    return { labelKey: 'map.badgeCrowdSevere', tone: 'bg-red-100 text-red-800 border-red-300', bar: 'bg-red-600' };
  }
  if (chance >= 50) {
    return { labelKey: 'map.badgeCrowdHigh', tone: 'bg-orange-100 text-orange-800 border-orange-300', bar: 'bg-orange-500' };
  }
  if (chance >= 30) {
    return { labelKey: 'map.badgeCrowdModerate', tone: 'bg-amber-100 text-amber-800 border-amber-300', bar: 'bg-amber-500' };
  }
  return { labelKey: 'map.badgeCrowdLow', tone: 'bg-emerald-100 text-emerald-800 border-emerald-300', bar: 'bg-emerald-600' };
}

function trafficMeta(value) {
  const load = Number(value || 0);
  if (load >= 0.66) {
    return { labelKey: 'map.badgeTrafficHeavy', tone: 'bg-red-100 text-red-800 border-red-300' };
  }
  if (load >= 0.33) {
    return { labelKey: 'map.badgeTrafficModerate', tone: 'bg-amber-100 text-amber-800 border-amber-300' };
  }
  return { labelKey: 'map.badgeTrafficSmooth', tone: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
}

export function DashboardPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const payload = await fetchDashboardData();
        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'Failed to load dashboard data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const metrics = useMemo(() => {
    const points = data?.map_points || [];

    if (!points.length) {
      return {
        highestRisk: null,
        avgRisk: 0,
        highRiskCount: 0,
        avgSustainability: 0,
      };
    }

    const highestRisk = points.reduce((max, point) => (point.risk_score > max.risk_score ? point : max), points[0]);
    const avgRisk = points.reduce((sum, point) => sum + point.risk_score, 0) / points.length;
    const highRiskCount = points.filter((point) => point.risk_score > 70).length;
    const avgSustainability = points.reduce((sum, point) => sum + point.sustainability_score, 0) / points.length;

    return {
      highestRisk,
      avgRisk,
      highRiskCount,
      avgSustainability,
    };
  }, [data]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('dashboard.title')}</h1>
          <p className="text-sm text-slate-600">{t('dashboard.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setRefreshTick((value) => value + 1);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t('dashboard.refresh')}
        </button>
      </header>

      <AsyncState loading={loading} error={error}>
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title={t('dashboard.kpi.highest')}
              value={metrics.highestRisk ? metrics.highestRisk.name : 'N/A'}
              subtitle={metrics.highestRisk ? `Risk ${metrics.highestRisk.risk_score.toFixed(1)}` : t('dashboard.kpi.noData')}
              tone={metrics.highestRisk ? getTone(metrics.highestRisk.risk_score) : 'neutral'}
            />
            <KpiCard
              title={t('dashboard.kpi.average')}
              value={metrics.avgRisk.toFixed(1)}
              subtitle={t('dashboard.kpi.allSites')}
              tone={getTone(metrics.avgRisk)}
            />
            <KpiCard
              title={t('dashboard.kpi.redAlerts')}
              value={metrics.highRiskCount}
              subtitle={t('dashboard.kpi.redThreshold')}
              tone={metrics.highRiskCount > 0 ? 'danger' : 'success'}
            />
            <KpiCard
              title={t('dashboard.kpi.sustainability')}
              value={metrics.avgSustainability.toFixed(1)}
              subtitle={t('dashboard.kpi.highSafer')}
              tone={metrics.avgSustainability < 40 ? 'danger' : 'neutral'}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <Panel title={t('dashboard.panel.heatmap')} subtitle={t('dashboard.panel.heatmapSub')}>
              <RiskMap
                points={data?.map_points || []}
                onSelectLocation={(locationId) => navigate(`/analytics?location=${locationId}`)}
              />
            </Panel>

            <Panel title={t('dashboard.panel.current')} subtitle={t('dashboard.panel.currentSub')}>
              <div className="space-y-3">
                {(data?.map_points || []).map((point) => (
                  <div key={point.location_id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {(() => {
                      const crowdMeta = crowdForecastMeta(point.crowd_chance);
                      const traffic = trafficMeta(point.traffic_index);
                      const crowdChance = Number(point.crowd_chance || 0);
                      return (
                        <>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-800">{point.name}</p>
                      <StatusPill value={point.risk_level} />
                    </div>
                    <p className="text-xs text-slate-600">
                      {formatNumber(point.predicted_footfall)} / {formatNumber(point.capacity)} capacity ({Number(point.capacity_utilization_pct || 0).toFixed(1)}%)
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {t('dashboard.weatherLabel')}: {point.weather?.condition || t('dashboard.na')} | {t('dashboard.aqiLabel')}: {point.aqi?.category || t('dashboard.na')}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={clsx('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', crowdMeta.tone)}>
                        {t('map.crowdForecast')}: {t(crowdMeta.labelKey)} ({crowdChance.toFixed(1)}%)
                      </span>
                      <span className={clsx('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', traffic.tone)}>
                        {t('map.traffic')}: {t(traffic.labelKey)} ({(Number(point.traffic_index || 0) * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-slate-200">
                      <div className={clsx('h-full rounded', crowdMeta.bar)} style={{ width: `${Math.max(0, Math.min(100, crowdChance))}%` }} />
                    </div>
                    <div className="mt-1">
                      <span className={clsx('inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold', sourceTone(point.weather_source))}>
                        {t('dashboard.source')}: {sourceLabel(point.weather_source)}
                      </span>
                    </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 2xl:grid-cols-2">
            <Panel title={t('dashboard.panel.riskTrend')} subtitle={t('dashboard.panel.riskTrendSub')}>
              <RiskTrendChart rows={data?.risk_trend || []} />
            </Panel>

            <Panel title={t('dashboard.panel.capacity')} subtitle={t('dashboard.panel.capacitySub')}>
              <CapacityComparisonChart rows={data?.capacity_comparison || []} />
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title={t('dashboard.panel.weather')} subtitle={t('dashboard.panel.weatherSub')}>
              <div className="space-y-2">
                {(data?.map_points || []).map((point) => (
                  <div key={`env-${point.location_id}`} className="grid grid-cols-[1.2fr_1fr_0.9fr] items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-800">{point.name}</p>
                      <p className="text-xs text-slate-500">{point.weather?.description || t('dashboard.noDesc')}</p>
                    </div>
                    <div className="text-slate-700">
                      {point.weather?.temperature_c != null ? `${point.weather.temperature_c.toFixed(1)} C` : t('dashboard.na')}
                    </div>
                    <div>
                      <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', aqiTone(point.aqi?.index || 1))}>
                        {t('dashboard.aqiLabel')} {point.aqi?.index || t('dashboard.na')}
                      </span>
                      <div className="mt-1">
                        <span className={clsx('inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold', sourceTone(point.weather_source))}>
                          {sourceLabel(point.weather_source)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title={t('dashboard.panel.summary')} subtitle={t('dashboard.panel.summarySub')}>
              <div className="space-y-2">
                {(data?.plain_language_cards || []).map((item) => (
                  <div key={item.location_id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-sm font-medium text-slate-800">{item.location_name}</p>
                    <p className="text-xs text-slate-600">{item.summary}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <section>
            <Panel title={t('dashboard.panel.chat')} subtitle={t('dashboard.panel.chatSub')}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-700">
                  {t('dashboard.askText')}
                </p>
                <Link
                  to="/analytics/chat"
                  className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  {t('dashboard.openChatbot')}
                </Link>
              </div>
            </Panel>
          </section>
        </>
      </AsyncState>
    </div>
  );
}
