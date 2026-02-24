import { Panel } from '../components/Panel';
import { useLanguage } from '../i18n/LanguageContext';

function buildStages(t) {
  return [
    {
    title: t('flowchart.stage1.title'),
    subtitle: t('flowchart.stage1.subtitle'),
    accent: 'border-slate-300 bg-slate-50',
    items: [
      t('flowchart.stage1.item1'),
      t('flowchart.stage1.item2'),
      t('flowchart.stage1.item3'),
      t('flowchart.stage1.item4'),
      t('flowchart.stage1.item5'),
    ],
  },
  {
    title: t('flowchart.stage2.title'),
    subtitle: t('flowchart.stage2.subtitle'),
    accent: 'border-slate-300 bg-slate-800 text-white',
    items: [
      t('flowchart.stage2.item1'),
      t('flowchart.stage2.item2'),
      t('flowchart.stage2.item3'),
      t('flowchart.stage2.item4'),
      t('flowchart.stage2.item5'),
    ],
  },
  {
    title: t('flowchart.stage3.title'),
    subtitle: t('flowchart.stage3.subtitle'),
    accent: 'border-blue-300 bg-blue-50',
    items: [
      t('flowchart.stage3.item1'),
      t('flowchart.stage3.item2'),
      t('flowchart.stage3.item3'),
      t('flowchart.stage3.item4'),
    ],
  },
  {
    title: t('flowchart.stage4.title'),
    subtitle: t('flowchart.stage4.subtitle'),
    accent: 'border-amber-300 bg-amber-50',
    items: [
      t('flowchart.stage4.item1'),
      t('flowchart.stage4.item2'),
      t('flowchart.stage4.item3'),
    ],
  },
  {
    title: t('flowchart.stage5.title'),
    subtitle: t('flowchart.stage5.subtitle'),
    accent: 'border-emerald-300 bg-emerald-50',
    items: [
      t('flowchart.stage5.item1'),
      t('flowchart.stage5.item2'),
      t('flowchart.stage5.item3'),
      t('flowchart.stage5.item4'),
    ],
  },
  {
    title: t('flowchart.stage6.title'),
    subtitle: t('flowchart.stage6.subtitle'),
    accent: 'border-indigo-300 bg-indigo-50',
    items: [
      '/api/dashboard',
      '/api/analytics/:location_id',
      '/api/risk/:location_id',
      '/api/mitigation/:location_id',
      t('flowchart.stage6.item5'),
      t('flowchart.stage6.item6'),
    ],
  },
];
}

function stageItemClass(accent) {
  return accent.includes('text-white')
    ? 'rounded-lg border border-slate-600 bg-slate-700/70 px-3 py-2 text-xs'
    : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700';
}

export function FlowchartPage() {
  const { t } = useLanguage();
  const stages = buildStages(t);
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{t('flowchart.title')}</h1>
        <p className="text-sm text-slate-600">{t('flowchart.subtitle')}</p>
      </header>

      <Panel title={t('flowchart.legendTitle')} subtitle={t('flowchart.legendSub')}>
        <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-100 px-2 py-1 text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
            {t('flowchart.green')}
          </span>
          <span className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-amber-800">
            <span className="h-2 w-2 rounded-full bg-amber-600" />
            {t('flowchart.yellow')}
          </span>
          <span className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-red-100 px-2 py-1 text-red-800">
            <span className="h-2 w-2 rounded-full bg-red-600" />
            {t('flowchart.red')}
          </span>
        </div>
      </Panel>

      <div className="space-y-3">
        {stages.map((stage, index) => (
          <div key={stage.title} className="space-y-3">
            <section className={`rounded-xl border p-4 ${stage.accent}`}>
              <div className="mb-3">
                <h2 className="text-sm font-semibold">{stage.title}</h2>
                <p className={`text-xs ${stage.accent.includes('text-white') ? 'text-slate-200' : 'text-slate-600'}`}>
                  {stage.subtitle}
                </p>
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {stage.items.map((item) => (
                  <div key={item} className={stageItemClass(stage.accent)}>
                    {item}
                  </div>
                ))}
              </div>
            </section>

            {index < stages.length - 1 ? (
              <div className="flex justify-center text-slate-400" aria-hidden="true">
                <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-lg leading-none">↓</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <Panel title={t('flowchart.outcomeTitle')} subtitle={t('flowchart.outcomeSub')}>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {t('flowchart.outcome1')}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {t('flowchart.outcome2')}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {t('flowchart.outcome3')}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {t('flowchart.outcome4')}
          </div>
        </div>
      </Panel>
    </div>
  );
}
