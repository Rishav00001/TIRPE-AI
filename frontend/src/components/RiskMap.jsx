import { Fragment } from 'react';
import { Circle, CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import { formatNumber, riskColor, sourceLabel } from '../utils/formatters';
import { useLanguage } from '../i18n/LanguageContext';

const indiaCenter = [22.9734, 78.6569];
const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

const tileConfig = mapboxToken
  ? {
      url: `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
      attribution:
        '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }
  : {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
    };

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function toCrowdChance(point) {
  if (Number.isFinite(Number(point?.crowd_chance))) {
    return clamp(Number(point.crowd_chance));
  }

  const utilization = Number(point?.capacity) > 0
    ? (Number(point?.predicted_footfall || 0) / Number(point.capacity)) * 100
    : 0;
  return clamp(Number(point?.risk_score || 0) * 0.6 + utilization * 0.4);
}

function trafficLevel(index) {
  const normalized = Number(index || 0);
  if (normalized >= 0.66) {
    return 'HIGH';
  }
  if (normalized >= 0.33) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function crowdForecastMeta(crowdChance) {
  const value = Number(crowdChance || 0);
  if (value >= 75) {
    return {
      labelKey: 'map.badgeCrowdSevere',
      tone: 'bg-red-100 text-red-800 border-red-300',
      dot: 'bg-red-600',
    };
  }
  if (value >= 50) {
    return {
      labelKey: 'map.badgeCrowdHigh',
      tone: 'bg-orange-100 text-orange-800 border-orange-300',
      dot: 'bg-orange-500',
    };
  }
  if (value >= 30) {
    return {
      labelKey: 'map.badgeCrowdModerate',
      tone: 'bg-amber-100 text-amber-800 border-amber-300',
      dot: 'bg-amber-500',
    };
  }
  return {
    labelKey: 'map.badgeCrowdLow',
    tone: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    dot: 'bg-emerald-600',
  };
}

function trafficMeta(index) {
  const value = Number(index || 0);
  if (value >= 0.66) {
    return {
      labelKey: 'map.badgeTrafficHeavy',
      tone: 'bg-red-100 text-red-800 border-red-300',
    };
  }
  if (value >= 0.33) {
    return {
      labelKey: 'map.badgeTrafficModerate',
      tone: 'bg-amber-100 text-amber-800 border-amber-300',
    };
  }
  return {
    labelKey: 'map.badgeTrafficSmooth',
    tone: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  };
}

function weatherTintMeta(conditionRaw) {
  const condition = String(conditionRaw || '').toLowerCase();

  if (condition.includes('thunder') || condition.includes('storm')) {
    return {
      color: '#8b5cf6',
      labelKey: 'map.weatherStorm',
    };
  }
  if (condition.includes('rain') || condition.includes('drizzle') || condition.includes('snow')) {
    return {
      color: '#3b82f6',
      labelKey: 'map.weatherRain',
    };
  }
  if (condition.includes('mist') || condition.includes('fog') || condition.includes('haze') || condition.includes('smoke')) {
    return {
      color: '#64748b',
      labelKey: 'map.weatherHaze',
    };
  }
  if (condition.includes('cloud')) {
    return {
      color: '#94a3b8',
      labelKey: 'map.weatherClouds',
    };
  }
  return {
    color: '#f59e0b',
    labelKey: 'map.weatherClear',
  };
}

function weatherHaloRadius(point) {
  const environmental = Number(point?.environmental_risk_index || 0);
  const risk = Number(point?.risk_score || 0) / 100;
  const blended = Math.max(0.1, Math.min(1, environmental * 0.6 + risk * 0.4));
  return 7000 + blended * 6000;
}

export function RiskMap({ points, onSelectLocation }) {
  const { t } = useLanguage();
  const providerLabel = mapboxToken ? 'Mapbox API' : 'OpenStreetMap';

  return (
    <div className="relative h-[380px] overflow-hidden rounded-lg border border-slate-200">
      <MapContainer center={indiaCenter} zoom={5} minZoom={4} scrollWheelZoom className="h-full w-full">
        <TileLayer attribution={tileConfig.attribution} url={tileConfig.url} />

        {points.map((point) => {
          const crowdChance = toCrowdChance(point);
          const crowdMeta = crowdForecastMeta(crowdChance);
          const trafficBadge = trafficMeta(point.traffic_index);
          const weatherTint = weatherTintMeta(point.weather?.condition);

          return (
            <Fragment key={point.location_id}>
              <Circle
                center={[point.latitude, point.longitude]}
                radius={weatherHaloRadius(point)}
                interactive={false}
                pathOptions={{
                  color: weatherTint.color,
                  fillColor: weatherTint.color,
                  fillOpacity: 0.11,
                  opacity: 0,
                }}
              />

              <CircleMarker
                center={[point.latitude, point.longitude]}
                radius={Math.max(8, crowdChance / 5)}
                pathOptions={{
                  color: riskColor(point.risk_score),
                  fillColor: riskColor(point.risk_score),
                  fillOpacity: 0.35 + Math.min(0.45, crowdChance / 180),
                  weight: 1.5 + Number(point.traffic_index || 0) * 2.5,
                }}
                eventHandlers={{
                  click: () => {
                    if (typeof onSelectLocation === 'function') {
                      onSelectLocation(point.location_id);
                    }
                  },
                }}
              >
                <Popup>
                  <div className="space-y-1.5 text-sm">
                    <div className="font-semibold">{point.name}</div>
                    <div className="flex flex-wrap gap-1">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${crowdMeta.tone}`}>
                        {t('map.crowd')}: {t(crowdMeta.labelKey)}
                      </span>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${trafficBadge.tone}`}>
                        {t(trafficBadge.labelKey)}
                      </span>
                      <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                        {t('map.weatherLayer')}: {t(weatherTint.labelKey)}
                      </span>
                    </div>
                    <div>{t('map.risk')}: {point.risk_score.toFixed(1)}</div>
                    <div>{t('map.crowdChance')}: {crowdChance.toFixed(1)}%</div>
                    <div>{t('map.trafficLoad')}: {(Number(point.traffic_index || 0) * 100).toFixed(1)}% ({trafficLevel(point.traffic_index)})</div>
                    <div>{t('map.predicted')}: {formatNumber(point.predicted_footfall)}</div>
                    <div>{t('map.capacity')}: {formatNumber(point.capacity)}</div>
                    {point.weather?.condition ? <div>{t('map.weather')}: {point.weather.condition}</div> : null}
                    {point.aqi?.category ? <div>{t('map.aqi')}: {point.aqi.category}</div> : null}
                    {point.weather_source ? <div>{t('map.source')}: {sourceLabel(point.weather_source)}</div> : null}
                    {point.traffic_source ? <div>{t('map.trafficSource')}: {sourceLabel(point.traffic_source) || point.traffic_source}</div> : null}
                  </div>
                </Popup>
              </CircleMarker>
            </Fragment>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[11px] text-slate-700 shadow-sm">
        <div className="font-semibold text-slate-800">{t('map.indiaOperations')}</div>
        <div>{t('map.provider')}: {providerLabel}</div>
        <div>{t('map.legendRisk')}</div>
        <div>{t('map.legendTraffic')}</div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[11px] text-slate-700 shadow-sm">
        <div className="mb-1 font-semibold text-slate-800">{t('map.crowdForecast')}</div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
          <span>{t('map.crowdLow')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          <span>{t('map.crowdModerate')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
          <span>{t('map.crowdHigh')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
          <span>{t('map.crowdSevere')}</span>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[11px] text-slate-700 shadow-sm">
        <div className="mb-1 font-semibold text-slate-800">{t('map.weatherLayer')}</div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          <span>{t('map.weatherClear')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
          <span>{t('map.weatherClouds')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
          <span>{t('map.weatherRain')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
          <span>{t('map.weatherHaze')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
          <span>{t('map.weatherStorm')}</span>
        </div>
      </div>
    </div>
  );
}
