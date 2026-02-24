import { clsx } from 'clsx';

export function KpiCard({ title, value, subtitle, tone = 'neutral' }) {
  const toneClass = {
    neutral: 'border-slate-200',
    success: 'border-emerald-300 bg-emerald-50/35',
    warning: 'border-amber-300 bg-amber-50/35',
    danger: 'border-red-300 bg-red-50/35',
  };

  return (
    <div className={clsx('rounded-xl border p-4', toneClass[tone])}>
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-slate-600">{subtitle}</p> : null}
    </div>
  );
}
