import { useEffect, useState } from 'react';
import { createApiKey, fetchApiKeys, revokeApiKey } from '../api/client';
import { Panel } from '../components/Panel';
import { useLanguage } from '../i18n/LanguageContext';

export function ApiAccessPage() {
  const { t } = useLanguage();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    key_name: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [latestKey, setLatestKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await fetchApiKeys();
        if (!cancelled) {
          setKeys(rows);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError?.response?.data?.message || requestError.message || t('developer.errorLoad'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function onChange(event) {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  }

  async function onCreate(event) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await createApiKey({
        key_name: form.key_name.trim(),
        scopes: ['risk.read', 'predict.write'],
      });
      setLatestKey(created.api_key);
      setKeys((prev) => [
        {
          id: created.id,
          key_name: created.key_name,
          key_prefix: created.key_prefix,
          scopes: created.scopes || [],
          is_active: created.is_active,
          last_used_at: created.last_used_at,
          created_at: created.created_at,
        },
        ...prev,
      ]);
      setForm({ key_name: '' });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError.message || t('developer.errorCreate'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onRevoke(id) {
    try {
      await revokeApiKey(id);
      setKeys((prev) => prev.map((row) => (row.id === id ? { ...row, is_active: false } : row)));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError.message || t('developer.errorRevoke'));
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{t('developer.title')}</h1>
        <p className="text-sm text-slate-600">
          {t('developer.subtitle')} <code>/api/external/risk/:location_id</code> {t('developer.and')} <code>/api/external/predict</code>.
        </p>
      </header>

      <Panel title={t('developer.createTitle')} subtitle={t('developer.createSub')}>
        <form onSubmit={onCreate} className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            name="key_name"
            value={form.key_name}
            onChange={onChange}
            placeholder={t('developer.keyPlaceholder')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? t('developer.creating') : t('developer.generate')}
          </button>
        </form>

        {latestKey ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-semibold">{t('developer.copyNow')}</p>
            <code className="mt-1 block break-all">{latestKey}</code>
          </div>
        ) : null}
      </Panel>

      <Panel title={t('developer.issuedTitle')} subtitle={t('developer.issuedSub')}>
        {loading ? <p className="text-sm text-slate-600">{t('developer.loading')}</p> : null}
        {error ? (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <div className="space-y-2">
          {keys.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{row.key_name}</p>
                <p className="text-xs text-slate-500">
                  {t('developer.prefix')}: {row.key_prefix} • {t('developer.status')}: {row.is_active ? t('developer.active') : t('developer.revoked')}
                </p>
              </div>
              {row.is_active ? (
                <button
                  type="button"
                  onClick={() => onRevoke(row.id)}
                  className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700"
                >
                  {t('developer.revoke')}
                </button>
              ) : (
                <span className="text-xs text-slate-500">{t('developer.revoked')}</span>
              )}
            </div>
          ))}
          {!keys.length && !loading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {t('developer.empty')}
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
