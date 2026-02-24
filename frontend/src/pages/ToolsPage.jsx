import { KpiCard } from '../components/KpiCard';
import { Panel } from '../components/Panel';
import { useLanguage } from '../i18n/LanguageContext';

const toolGroups = [
  {
    categoryKey: 'tools.group.frontend',
    items: [
      { nameKey: 'tools.item.frontend1.name', descriptionKey: 'tools.item.frontend1.desc' },
      { nameKey: 'tools.item.frontend2.name', descriptionKey: 'tools.item.frontend2.desc' },
      { nameKey: 'tools.item.frontend3.name', descriptionKey: 'tools.item.frontend3.desc' },
      { nameKey: 'tools.item.frontend4.name', descriptionKey: 'tools.item.frontend4.desc' },
    ],
  },
  {
    categoryKey: 'tools.group.backend',
    items: [
      { nameKey: 'tools.item.backend1.name', descriptionKey: 'tools.item.backend1.desc' },
      { nameKey: 'tools.item.backend2.name', descriptionKey: 'tools.item.backend2.desc' },
      { nameKey: 'tools.item.backend3.name', descriptionKey: 'tools.item.backend3.desc' },
      { nameKey: 'tools.item.backend4.name', descriptionKey: 'tools.item.backend4.desc' },
    ],
  },
  {
    categoryKey: 'tools.group.ai',
    items: [
      { nameKey: 'tools.item.ai1.name', descriptionKey: 'tools.item.ai1.desc' },
      { nameKey: 'tools.item.ai2.name', descriptionKey: 'tools.item.ai2.desc' },
      { nameKey: 'tools.item.ai3.name', descriptionKey: 'tools.item.ai3.desc' },
      { nameKey: 'tools.item.ai4.name', descriptionKey: 'tools.item.ai4.desc' },
    ],
  },
  {
    categoryKey: 'tools.group.ops',
    items: [
      { nameKey: 'tools.item.ops1.name', descriptionKey: 'tools.item.ops1.desc' },
      { nameKey: 'tools.item.ops2.name', descriptionKey: 'tools.item.ops2.desc' },
      { nameKey: 'tools.item.ops3.name', descriptionKey: 'tools.item.ops3.desc' },
      { nameKey: 'tools.item.ops4.name', descriptionKey: 'tools.item.ops4.desc' },
    ],
  },
  {
    categoryKey: 'tools.group.security',
    items: [
      { nameKey: 'tools.item.sec1.name', descriptionKey: 'tools.item.sec1.desc' },
      { nameKey: 'tools.item.sec2.name', descriptionKey: 'tools.item.sec2.desc' },
      { nameKey: 'tools.item.sec3.name', descriptionKey: 'tools.item.sec3.desc' },
      { nameKey: 'tools.item.sec4.name', descriptionKey: 'tools.item.sec4.desc' },
    ],
  },
];

const dataFlowTools = [
  'tools.flow.1',
  'tools.flow.2',
  'tools.flow.3',
  'tools.flow.4',
  'tools.flow.5',
  'tools.flow.6',
  'tools.flow.7',
];

export function ToolsPage() {
  const { t } = useLanguage();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{t('tools.title')}</h1>
        <p className="text-sm text-slate-600">{t('tools.subtitle')}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title={t('tools.kpi.frontend')} value="4" subtitle={t('tools.kpi.frontendSub')} tone="neutral" />
        <KpiCard title={t('tools.kpi.backend')} value="4" subtitle={t('tools.kpi.backendSub')} tone="neutral" />
        <KpiCard title={t('tools.kpi.ai')} value="4" subtitle={t('tools.kpi.aiSub')} tone="neutral" />
        <KpiCard title={t('tools.kpi.ops')} value="8" subtitle={t('tools.kpi.opsSub')} tone="neutral" />
      </section>

      <section className="space-y-4">
        {toolGroups.map((group) => (
          <Panel key={group.categoryKey} title={t(group.categoryKey)} subtitle={t('tools.implemented')}>
            <div className="grid gap-3 md:grid-cols-2">
              {group.items.map((tool) => (
                <div key={tool.nameKey} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-800">{t(tool.nameKey)}</p>
                  <p className="text-xs text-slate-600">{t(tool.descriptionKey)}</p>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </section>

      <Panel title={t('tools.flowTitle')} subtitle={t('tools.flowSub')}>
        <div className="grid gap-2 xl:grid-cols-6">
          {dataFlowTools.map((item, index) => (
            <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-700">
              <div>{t(item)}</div>
              {index < dataFlowTools.length - 1 ? <div className="mt-1 text-slate-400">→</div> : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={t('tools.whyTitle')} subtitle={t('tools.whySub')}>
        <div className="space-y-2 text-sm text-slate-700">
          <p>{t('tools.why.1')}</p>
          <p>{t('tools.why.2')}</p>
          <p>{t('tools.why.3')}</p>
        </div>
      </Panel>
    </div>
  );
}
