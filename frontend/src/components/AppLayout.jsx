import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ConsoleSidebar } from './ConsoleSidebar';
import { useLanguage } from '../i18n/LanguageContext';

const navigation = [
  { nameKey: 'nav.dashboard', path: '/dashboard', marker: 'D' },
  { nameKey: 'nav.analytics', path: '/analytics', marker: 'A' },
  { nameKey: 'nav.chatbot', path: '/analytics/chat', marker: 'C', compact: true },
  { nameKey: 'nav.feedback', path: '/feedback', marker: 'R' },
  { nameKey: 'nav.developer', path: '/developer', marker: 'K' },
  { nameKey: 'nav.flowchart', path: '/flowchart', marker: 'F' },
  { nameKey: 'nav.tools', path: '/tools', marker: 'T' },
];

function navClass({ isActive }) {
  return [
    'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-slate-700 text-white'
      : 'text-slate-300 hover:bg-slate-700/60 hover:text-white',
  ].join(' ');
}

export function AppLayout() {
  const { t, language, setLanguage, supportedLanguages } = useLanguage();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_340px]">
        <aside className="border-r border-slate-700 bg-slate-800 px-5 py-6">
          <div className="mb-8 border-b border-slate-700 pb-5">
            <h1 className="text-lg font-semibold tracking-wide text-white">{t('app.title')}</h1>
            <p className="mt-1 text-xs text-slate-400">{t('app.subtitle')}</p>
          </div>

          <nav className="space-y-2">
            {navigation.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={(state) => [
                  navClass(state),
                  item.compact ? 'ml-3 text-xs' : '',
                ].join(' ')}
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-slate-600 bg-slate-700/70 text-[10px] font-semibold text-slate-100">
                  {item.marker}
                </span>
                <span>{t(item.nameKey)}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-6 rounded-lg border border-slate-700 bg-slate-700/30 p-2">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-300">
              {t('sidebar.language')}
            </label>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 outline-none"
            >
              {supportedLanguages.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 rounded-lg border border-slate-700 bg-slate-700/30 p-2 text-xs text-slate-300">
            <p className="font-semibold text-slate-100">{user?.display_name || user?.username || 'User'}</p>
            <p className="mt-0.5 uppercase tracking-wide">{user?.role || 'user'}</p>
            <button
              type="button"
              onClick={logout}
              className="mt-2 w-full rounded-md border border-slate-500 bg-slate-800 px-2 py-1 text-xs text-slate-100 hover:bg-slate-700"
            >
              {t('sidebar.logout')}
            </button>
          </div>

          <div className="mt-8 border-t border-slate-700 pt-4 text-xs text-slate-400">
            <p>{t('sidebar.smartCity')}</p>
            <p className="mt-1">{t('sidebar.version')}</p>
          </div>
        </aside>

        <main className="overflow-x-hidden px-5 py-6 lg:px-8">
          <Outlet />
        </main>

        <ConsoleSidebar />
      </div>
    </div>
  );
}
