import { format } from 'date-fns';

export function riskColor(riskScore) {
  if (riskScore > 70) return '#B42318';
  if (riskScore >= 40) return '#D97904';
  return '#157347';
}

export function riskLabel(riskScore) {
  if (riskScore > 70) return 'RED';
  if (riskScore >= 40) return 'YELLOW';
  return 'GREEN';
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(Math.round(Number(value || 0)));
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function formatShortTime(value) {
  return format(new Date(value), 'HH:mm');
}

export function aqiTone(index) {
  if (index >= 5) return 'text-red-700 bg-red-100';
  if (index >= 4) return 'text-orange-700 bg-orange-100';
  if (index >= 3) return 'text-amber-700 bg-amber-100';
  if (index >= 2) return 'text-green-700 bg-green-100';
  return 'text-emerald-700 bg-emerald-100';
}

export function sourceLabel(source) {
  if (source === 'openweather-live') return 'LIVE';
  if (source === 'openai-estimated') return 'AI-ESTIMATED';
  if (source === 'google-routes-nearby-live') return 'GOOGLE-LIVE';
  if (source === 'openai-traffic-estimated') return 'AI-TRAFFIC';
  if (source === 'synthetic-fallback' || source === 'historical-synthetic') return 'MOCK';
  return 'UNKNOWN';
}

export function sourceTone(source) {
  if (source === 'openweather-live') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (source === 'openai-estimated') return 'bg-amber-100 text-amber-800 border-amber-300';
  if (source === 'synthetic-fallback' || source === 'historical-synthetic') return 'bg-red-100 text-red-800 border-red-300';
  return 'bg-slate-100 text-slate-700 border-slate-300';
}
