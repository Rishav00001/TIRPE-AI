import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchAnalytics, fetchJudgeReport, fetchLocations, fetchMitigation, fetchRuntimeConfig } from '../api/client';
import { AsyncState } from '../components/AsyncState';
import { KpiCard } from '../components/KpiCard';
import { Panel } from '../components/Panel';
import { StatusPill } from '../components/StatusPill';
import { CrowdForecastChart } from '../components/charts/CrowdForecastChart';
import { TrafficCorrelationChart } from '../components/charts/TrafficCorrelationChart';
import { aqiTone, sourceLabel, sourceTone } from '../utils/formatters';
import { useLanguage } from '../i18n/LanguageContext';

function driverLabel(key, t) {
  const labels = {
    crowd_load: t('analytics.factor.crowd'),
    weather_environment: t('analytics.factor.weather'),
    traffic: t('analytics.factor.traffic'),
    social_signal: t('analytics.factor.social'),
  };

  return labels[key] || key;
}

function factorRows(factorBreakdown, t) {
  if (!factorBreakdown) {
    return [];
  }

  return [
    { key: 'crowd_load', label: t('analytics.factor.crowd'), value: factorBreakdown.crowd_load || 0 },
    { key: 'weather_environment', label: t('analytics.factor.weather'), value: factorBreakdown.weather_environment || 0 },
    { key: 'traffic', label: t('analytics.factor.traffic'), value: factorBreakdown.traffic || 0 },
    { key: 'social_signal', label: t('analytics.factor.social'), value: factorBreakdown.social_signal || 0 },
  ];
}

function isValidMonthKey(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

function currentMonthKeyUTC() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildRecentMonthOptions(language, count = 12) {
  const options = [];
  const now = new Date();
  now.setUTCDate(1);
  now.setUTCHours(0, 0, 0, 0);

  for (let idx = 0; idx < count; idx += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - idx, 1));
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = new Intl.DateTimeFormat(language || 'en', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
    options.push({ value, label });
  }

  return options;
}

function formatDateLabel(dateValue, language) {
  if (!dateValue) {
    return '-';
  }

  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat(language || 'en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function AnalyticsPage() {
  const { t, language } = useLanguage();
  const [searchParams] = useSearchParams();
  const [locations, setLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [locationError, setLocationError] = useState(null);

  const [selectedLocationId, setSelectedLocationId] = useState(() => {
    const queryValue = Number(searchParams.get('location'));
    return Number.isInteger(queryValue) && queryValue > 0 ? queryValue : null;
  });
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const queryMonth = searchParams.get('month');
    return isValidMonthKey(queryMonth) ? queryMonth : currentMonthKeyUTC();
  });
  const [selectedWindow, setSelectedWindow] = useState(() => {
    const queryWindow = searchParams.get('window');
    if (queryWindow === 'last_30_days' || queryWindow === 'next_10_days') {
      return queryWindow;
    }
    return 'selected_month';
  });
  const [selectedDate, setSelectedDate] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [mitigation, setMitigation] = useState(null);
  const [runtimeConfig, setRuntimeConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMitigation, setLoadingMitigation] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState(null);
  const [mitigationError, setMitigationError] = useState(null);
  const [reportError, setReportError] = useState(null);
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLocations() {
      try {
        const locationRows = await fetchLocations();
        if (!cancelled) {
          setLocations(locationRows);
          setLocationError(null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setLocationError(requestError.message || 'Failed to load locations');
        }
      } finally {
        if (!cancelled) {
          setLoadingLocations(false);
        }
      }
    }

    async function loadRuntimeConfig() {
      try {
        const config = await fetchRuntimeConfig();
        if (!cancelled) {
          setRuntimeConfig(config);
        }
      } catch {
        if (!cancelled) {
          setRuntimeConfig({ ai_provider: 'unavailable', ai_model: 'unknown' });
        }
      }
    }

    loadLocations();
    loadRuntimeConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!locations?.length) {
      return;
    }

    if (selectedLocationId && locations.some((location) => location.id === selectedLocationId)) {
      return;
    }

    setSelectedLocationId(locations[0].id);
  }, [locations, selectedLocationId]);

  useEffect(() => {
    if (!selectedLocationId) {
      return;
    }

    let isCancelled = false;

    async function loadAnalytics() {
      setLoading(true);
      setError(null);
      setReportData(null);
      setReportError(null);

      try {
        const analyticsData = await fetchAnalytics(selectedLocationId, {
          month: selectedMonth,
          window: selectedWindow,
        });

        if (!isCancelled) {
          setAnalytics(analyticsData);

          const dailyRange = analyticsData?.daily_crowd_range || analyticsData?.monthly_crowd_range;
          const apiMonth = dailyRange?.selected_month;
          if (apiMonth && apiMonth !== selectedMonth) {
            setSelectedMonth(apiMonth);
          }

          const dailyProfile = dailyRange?.daily_profile || [];
          if (!dailyProfile.length) {
            setSelectedDate('');
          } else {
            setSelectedDate((prev) => {
              if (prev && dailyProfile.some((row) => row.date === prev)) {
                return prev;
              }
              return dailyProfile[0].date;
            });
          }
        }
      } catch (requestError) {
        if (!isCancelled) {
          setError(requestError.message || 'Failed to load analytics');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadAnalytics();

    return () => {
      isCancelled = true;
    };
  }, [selectedLocationId, selectedMonth, selectedWindow]);

  useEffect(() => {
    if (!selectedLocationId) {
      return;
    }

    let isCancelled = false;

    async function loadMitigation() {
      setLoadingMitigation(true);
      setMitigationError(null);

      try {
        const mitigationData = await fetchMitigation(selectedLocationId);
        if (!isCancelled) {
          setMitigation(mitigationData);
        }
      } catch (requestError) {
        if (!isCancelled) {
          setMitigationError(requestError.message || 'Mitigation is temporarily unavailable.');
          setMitigation(null);
        }
      } finally {
        if (!isCancelled) {
          setLoadingMitigation(false);
        }
      }
    }

    loadMitigation();

    return () => {
      isCancelled = true;
    };
  }, [selectedLocationId]);

  const sustainabilityNow = useMemo(() => Number(analytics?.current_risk?.sustainability_score || 0), [analytics]);

  const utilization = useMemo(() => {
    if (!analytics?.current_risk?.capacity) {
      return 0;
    }

    return (analytics.current_risk.predicted_footfall / analytics.current_risk.capacity) * 100;
  }, [analytics]);

  const sustainabilityTone = sustainabilityNow < 35 ? 'danger' : sustainabilityNow < 60 ? 'warning' : 'success';
  const dominantDriver = analytics?.plain_explanation?.dominant_driver;
  const riskFactors = factorRows(analytics?.plain_explanation?.factor_breakdown, t);

  const weatherCondition = analytics?.plain_explanation?.environment?.weather?.condition || t('analytics.estimatedClear');
  const weatherTemperature = analytics?.plain_explanation?.environment?.weather?.temperature_c;
  const aqiIndex = analytics?.plain_explanation?.environment?.aqi?.index ?? 2;
  const aqiCategory = analytics?.plain_explanation?.environment?.aqi?.category || t('analytics.estimated');
  const source = analytics?.current_risk?.weather_source;
  const sourceReason = analytics?.current_risk?.environment?.source_reason;
  const dailyRange = analytics?.daily_crowd_range || analytics?.monthly_crowd_range;
  const fallbackMonthOptions = useMemo(() => buildRecentMonthOptions(language, 12), [language]);
  const monthOptions = useMemo(() => {
    const apiOptions = dailyRange?.available_months || [];
    if (!apiOptions.length) {
      return fallbackMonthOptions;
    }

    const normalized = apiOptions.map((entry) => ({
      value: entry.value,
      label: entry.label,
    }));

    if (selectedMonth && !normalized.some((entry) => entry.value === selectedMonth)) {
      normalized.unshift({
        value: selectedMonth,
        label: selectedMonth,
      });
    }

    return normalized;
  }, [fallbackMonthOptions, dailyRange, selectedMonth]);
  const dailyMaxSpread = useMemo(() => {
    return (dailyRange?.daily_profile || []).reduce((max, row) => {
      const spread = Number(row.max_footfall || 0) - Number(row.min_footfall || 0);
      return Math.max(max, spread);
    }, 1);
  }, [dailyRange]);
  const selectedDateRow = useMemo(() => {
    const profile = dailyRange?.daily_profile || [];
    if (!profile.length) {
      return null;
    }

    return profile.find((row) => row.date === selectedDate) || profile[0];
  }, [dailyRange, selectedDate]);

  async function onGenerateReport() {
    if (!selectedLocationId || loadingReport) {
      return;
    }

    setLoadingReport(true);
    setReportError(null);

    try {
      const payload = await fetchJudgeReport(selectedLocationId, true);
      setReportData(payload);
    } catch (requestError) {
      setReportError(requestError.message || t('analytics.reportError'));
      setReportData(null);
    } finally {
      setLoadingReport(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('analytics.title')}</h1>
          <p className="text-sm text-slate-600">{t('analytics.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            {t('analytics.location')}
            <select
              value={selectedLocationId ?? ''}
              onChange={(event) => setSelectedLocationId(Number(event.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              disabled={loadingLocations || !locations?.length}
            >
              {(locations || []).map((location) => (
                <option value={location.id} key={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            {t('analytics.window')}
            <select
              value={selectedWindow}
              onChange={(event) => setSelectedWindow(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="selected_month">{t('analytics.window.selectedMonth')}</option>
              <option value="last_30_days">{t('analytics.window.last30')}</option>
              <option value="next_10_days">{t('analytics.window.next10')}</option>
            </select>
          </label>

          {selectedWindow === 'selected_month' ? (
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              {t('analytics.month')}
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            {t('analytics.date')}
            <select
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              disabled={!(dailyRange?.daily_profile || []).length}
            >
              {(dailyRange?.daily_profile || []).map((row) => (
                <option key={row.date} value={row.date}>
                  {formatDateLabel(row.date, language)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <AsyncState loading={loadingLocations} error={locationError}>
        <AsyncState loading={loading} error={error}>
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title={t('analytics.kpi.currentRisk')}
                value={analytics?.current_risk?.risk_score?.toFixed(1) || '0.0'}
                subtitle={t('analytics.kpi.normalized')}
                tone={analytics?.current_risk?.risk_score > 70 ? 'danger' : analytics?.current_risk?.risk_score >= 40 ? 'warning' : 'success'}
              />
              <KpiCard
                title={t('analytics.kpi.predictedFootfall')}
                value={Math.round(analytics?.current_risk?.predicted_footfall || 0).toLocaleString('en-IN')}
                subtitle={t('analytics.kpi.nextWindow')}
                tone="neutral"
              />
              <KpiCard
                title={t('analytics.kpi.capacityUtilization')}
                value={`${utilization.toFixed(1)}%`}
                subtitle={t('analytics.kpi.capacitySubtitle')}
                tone={utilization > 85 ? 'danger' : utilization > 65 ? 'warning' : 'success'}
              />
              <KpiCard
                title={t('analytics.kpi.sustainability')}
                value={sustainabilityNow.toFixed(1)}
                subtitle={t('analytics.kpi.higherBetter')}
                tone={sustainabilityTone}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
              <div className="space-y-4">
                <Panel title={t('analytics.panel.forecast')} subtitle={t('analytics.panel.forecastSub')}>
                  <CrowdForecastChart rows={analytics?.forecast || []} />
                </Panel>

                <Panel title={t('analytics.panel.dailyRange')} subtitle={t('analytics.panel.dailyRangeSub')}>
                  {dailyRange?.has_data && dailyRange?.summary ? (
                    <div className="space-y-3">
                      <div className="grid gap-2 text-sm md:grid-cols-3">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-xs text-slate-500">{t('analytics.daily.min')}</div>
                          <div className="text-base font-semibold text-slate-800">{Number(dailyRange.summary.min_footfall || 0).toLocaleString('en-IN')}</div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-xs text-slate-500">{t('analytics.daily.avg')}</div>
                          <div className="text-base font-semibold text-slate-800">{Number(dailyRange.summary.avg_footfall || 0).toLocaleString('en-IN')}</div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-xs text-slate-500">{t('analytics.daily.max')}</div>
                          <div className="text-base font-semibold text-slate-800">{Number(dailyRange.summary.max_footfall || 0).toLocaleString('en-IN')}</div>
                        </div>
                      </div>

                      {selectedDateRow ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-slate-800">
                              {t('analytics.daily.selectedDate')}: {formatDateLabel(selectedDateRow.date, language)}
                            </span>
                            <span className="text-xs text-slate-500">
                              {t('analytics.daily.avg')} {Number(selectedDateRow.avg_footfall || 0).toLocaleString('en-IN')}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            {t('analytics.daily.range')}: {Number(selectedDateRow.min_footfall || 0).toLocaleString('en-IN')} - {Number(selectedDateRow.max_footfall || 0).toLocaleString('en-IN')}
                            {selectedDateRow.confidence_score != null ? ` | ${t('analytics.daily.confidence')} ${(Number(selectedDateRow.confidence_score) * 100).toFixed(1)}%` : ''}
                          </p>
                        </div>
                      ) : null}

                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="mb-2 text-xs font-semibold text-slate-500">
                          {t('analytics.daily.timeline')}
                        </div>
                        <div className="max-h-64 space-y-1.5 overflow-auto pr-1">
                          {(dailyRange.daily_profile || []).map((row) => {
                            const spread = Number(row.max_footfall || 0) - Number(row.min_footfall || 0);
                            const width = Math.max(8, (spread / dailyMaxSpread) * 100);
                            const selected = row.date === selectedDateRow?.date;
                            return (
                              <button
                                key={row.date}
                                type="button"
                                onClick={() => setSelectedDate(row.date)}
                                className={clsx(
                                  'grid w-full grid-cols-[100px_1fr_110px] items-center gap-2 rounded-md border px-2 py-1 text-left text-xs',
                                  selected ? 'border-slate-700 bg-slate-100 text-slate-900' : 'border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                                )}
                              >
                                <span>{formatDateLabel(row.date, language)}</span>
                                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                                  <div className="h-full rounded-full bg-slate-600" style={{ width: `${width}%` }} />
                                </div>
                                <span className="text-right">
                                  {Number(row.min_footfall).toLocaleString('en-IN')} - {Number(row.max_footfall).toLocaleString('en-IN')}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      {t('analytics.daily.noData')}
                    </div>
                  )}
                </Panel>

                <Panel title={t('analytics.panel.correlation')} subtitle={t('analytics.panel.correlationSub')}>
                  <TrafficCorrelationChart rows={analytics?.traffic_correlation || []} />
                </Panel>

                <Panel title={t('analytics.panel.breakdown')} subtitle={t('analytics.panel.breakdownSub')}>
                  <div className="space-y-3">
                    {riskFactors.map((item) => (
                      <div key={item.key}>
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                          <span>{item.label}</span>
                          <span>{item.value.toFixed(1)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full bg-slate-700" style={{ width: `${Math.min(100, Math.max(0, item.value))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              <div className="space-y-4">
                <Panel title={t('analytics.panel.explanation')} subtitle={t('analytics.panel.explanationSub')}>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {analytics?.plain_explanation?.summary || analytics?.current_risk?.plain_summary || t('analytics.noSummary')}
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                      <span className="text-sm text-slate-700">{t('analytics.riskClass')}</span>
                      <StatusPill value={analytics?.current_risk?.risk_level || 'GREEN'} />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                      <span className="text-sm text-slate-700">{t('analytics.topDriver')}</span>
                      <span className="text-sm font-semibold text-slate-800">{driverLabel(dominantDriver?.key || '', t)}</span>
                    </div>

                    <div className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="mb-2 text-xs font-semibold text-slate-500">{t('analytics.weatherSnapshot')}</div>
                      <div className="flex items-center justify-between text-sm text-slate-700">
                        <span>{weatherCondition}</span>
                        <span>{weatherTemperature != null ? `${weatherTemperature.toFixed(1)} C` : t('analytics.estimated')}</span>
                      </div>
                      <div className="mt-2">
                        <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', aqiTone(aqiIndex))}>
                          {t('common.aqi')} {aqiIndex} ({aqiCategory})
                        </span>
                        <span className={clsx('ml-2 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold', sourceTone(source))}>
                          {t('analytics.sourceStatus')}: {sourceLabel(source)}
                        </span>
                      </div>
                      {sourceReason ? (
                        <p className="mt-2 text-[11px] text-amber-700">
                          {t('analytics.sourceReason')}: {sourceReason}
                        </p>
                      ) : null}
                      {source && source !== 'openweather-live' ? (
                        <p className="mt-1 text-[11px] text-slate-600">{t('analytics.sourceTrustNote')}</p>
                      ) : null}
                    </div>
                  </div>
                </Panel>

                <Panel title={t('analytics.panel.judgeReport')} subtitle={t('analytics.panel.judgeReportSub')}>
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={onGenerateReport}
                      disabled={loadingReport || !selectedLocationId}
                      className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingReport ? t('analytics.generatingReport') : t('analytics.generateReport')}
                    </button>

                    {reportError ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        {reportError}
                      </div>
                    ) : null}

                    {reportData?.report_text ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                          <span>{reportData.title}</span>
                          <span className={clsx('rounded-md border px-1.5 py-0.5', reportData.mode === 'llm' ? 'border-emerald-300 bg-emerald-100 text-emerald-700' : 'border-amber-300 bg-amber-100 text-amber-700')}>
                            {reportData.mode === 'llm' ? 'AI' : 'Fallback'}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-slate-700">{reportData.report_text}</p>
                      </div>
                    ) : null}
                  </div>
                </Panel>

                <Panel title={t('analytics.panel.mitigation')} subtitle={t('analytics.panel.mitigationSub')}>
                  <div className="space-y-4 text-sm text-slate-700">
                    {loadingMitigation ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">
                        {t('analytics.loadingMitigation')}
                      </div>
                    ) : mitigationError ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                        {mitigationError}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        {mitigation?.advisory || t('analytics.noMitigation')}
                      </div>
                    )}

                    <div>
                      <p className="mb-2 text-xs font-semibold text-slate-500">{t('analytics.actions')}</p>
                      <ul className="space-y-2">
                        {(mitigation?.actions || []).map((item) => (
                          <li key={item} className="rounded-lg border border-slate-200 px-3 py-2">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold text-slate-500">{t('analytics.alternateLocations')}</p>
                      <ul className="space-y-2">
                        {(mitigation?.alternate_locations || []).slice(0, 3).map((location) => (
                          <li
                            key={location.location_id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                          >
                            <span>{location.name}</span>
                            <span className="text-xs text-slate-500">{t('common.risk')} {location.risk_score.toFixed(1)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Panel>

                <Panel title={t('analytics.panel.dataSources')} subtitle={t('analytics.panel.dataSourcesSub')}>
                  <div className="space-y-2 text-xs text-slate-700">
                    <div className="flex items-center justify-between">
                      <span>{t('analytics.source.footfall')}</span>
                      <span className="font-medium">PostgreSQL</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{t('analytics.source.weather')}</span>
                      <span className="font-medium">OpenWeather/OpenAI Fallback</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{t('analytics.source.prediction')}</span>
                      <span className="font-medium">FastAPI + Scikit-Learn</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{t('analytics.source.provider')}</span>
                      <span className="font-medium">{runtimeConfig?.ai_provider || 'unknown'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{t('analytics.source.model')}</span>
                      <span className="font-medium">{runtimeConfig?.ai_model || 'unknown'}</span>
                    </div>
                  </div>
                </Panel>

                <Link
                  to={`/analytics/chat?location=${selectedLocationId || ''}`}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  {t('analytics.openChatbot')}
                </Link>
              </div>
            </section>
          </>
        </AsyncState>
      </AsyncState>
    </div>
  );
}
