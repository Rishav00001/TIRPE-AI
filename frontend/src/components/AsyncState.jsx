import { useLanguage } from '../i18n/LanguageContext';

export function AsyncState({ loading, error, children }) {
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        {t('common.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return children;
}
