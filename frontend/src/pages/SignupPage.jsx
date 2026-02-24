import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';

export function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const { t } = useLanguage();
  const [form, setForm] = useState({
    username: '',
    password: '',
    display_name: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signup({
        username: form.username.trim(),
        password: form.password,
        display_name: form.display_name.trim() || undefined,
      });
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError.message || t('signup.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{t('signup.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('signup.subtitle')}</p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <input
            type="text"
            name="display_name"
            value={form.display_name}
            onChange={onChange}
            placeholder={t('signup.displayName')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
          <input
            type="text"
            name="username"
            value={form.username}
            onChange={onChange}
            placeholder={t('signup.username')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            required
          />
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={onChange}
            placeholder={t('signup.password')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            required
          />

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? t('signup.creating') : t('signup.submit')}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-600">
          {t('signup.haveAccess')}{' '}
          <Link to="/login" className="font-semibold text-slate-800 underline">
            {t('signup.login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
