import { useEffect, useMemo, useState } from 'react';
import {
  createFeedbackPost,
  fetchFeedbackPosts,
  getFeedbackRuntimeSource,
  pinFeedbackPost,
  voteFeedbackPost,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AsyncState } from '../components/AsyncState';
import { Panel } from '../components/Panel';
import { useLanguage } from '../i18n/LanguageContext';

function formatTimestamp(value) {
  try {
    return new Date(value).toLocaleString('en-IN', {
      hour12: true,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function formatFeedbackSource(source) {
  if (source === 'mock-local') {
    return 'Mock Backend (Local)';
  }
  if (source === 'mock-fallback') {
    return 'Mock Fallback (Auto)';
  }
  return 'Live Backend API';
}

export function FeedbackPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const voterId = `user:${user?.id || 0}`;
  const [feedbackSource, setFeedbackSource] = useState(getFeedbackRuntimeSource);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [postingError, setPostingError] = useState(null);
  const [votingPostId, setVotingPostId] = useState(null);

  const [form, setForm] = useState({
    title: '',
    details: '',
    location_name: '',
  });

  useEffect(() => {
    let cancelled = false;

    async function loadPosts() {
      try {
        const rows = await fetchFeedbackPosts({ voterId, limit: 80 });
        if (!cancelled) {
          setPosts(rows);
          setFeedbackSource(getFeedbackRuntimeSource());
          setError(null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'Failed to load feedback');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPosts();

    return () => {
      cancelled = true;
    };
  }, [voterId]);

  const stats = useMemo(() => {
    return {
      total: posts.length,
      totalVotes: posts.reduce((sum, post) => sum + Number(post.upvotes || 0) + Number(post.downvotes || 0), 0),
      positiveRatio: posts.length
        ? Math.round(
          (posts.filter((post) => Number(post.score || 0) > 0).length / posts.length) * 100,
        )
        : 0,
    };
  }, [posts]);

  function onChangeField(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setPostingError(null);

    try {
      const payload = await createFeedbackPost({
        author_name: user?.display_name || user?.username || 'User',
        title: form.title.trim(),
        details: form.details.trim(),
        location_name: form.location_name.trim() || undefined,
      });

      setPosts((prev) => [payload, ...prev]);
      setFeedbackSource(getFeedbackRuntimeSource());
      setForm({
        title: '',
        details: '',
        location_name: '',
      });
    } catch (requestError) {
      const apiMessage = requestError?.response?.data?.message;
      const details = requestError?.response?.data?.details;
      const firstDetail = Array.isArray(details) && details.length
        ? `${details[0]?.path || 'field'}: ${details[0]?.message || 'invalid'}`
        : null;
      setPostingError(firstDetail || apiMessage || requestError.message || 'Unable to create feedback');
    } finally {
      setSubmitting(false);
    }
  }

  async function onVote(postId, vote) {
    if (votingPostId === postId) {
      return;
    }

    setVotingPostId(postId);

    try {
      const updated = await voteFeedbackPost(postId, {
        vote,
      });

      setPosts((prev) => prev.map((post) => (
        post.id === postId
          ? { ...post, ...updated }
          : post
      )));
      setFeedbackSource(getFeedbackRuntimeSource());
    } catch {
      // keep UI stable; ignore transient vote errors
    } finally {
      setVotingPostId(null);
    }
  }

  async function onTogglePin(postId, currentPinned) {
    try {
      const updated = await pinFeedbackPost(postId, !currentPinned);
      setPosts((prev) => prev.map((post) => (
        post.id === postId
          ? { ...post, pinned: Boolean(updated?.pinned), pinned_at: updated?.pinned_at || null }
          : post
      )));
    } catch {
      // keep UI stable
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{t('feedback.title')}</h1>
        <p className="text-sm text-slate-600">{t('feedback.subtitle')}</p>
        <p className="mt-1 text-xs text-slate-500">Source: {formatFeedbackSource(feedbackSource)}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase text-slate-500">{t('feedback.kpi.posts')}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase text-slate-500">{t('feedback.kpi.votes')}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{stats.totalVotes}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase text-slate-500">{t('feedback.kpi.support')}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{stats.positiveRatio}%</p>
        </div>
      </section>

      <Panel title={t('feedback.createTitle')} subtitle={t('feedback.createSub')}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="text"
              name="location_name"
              value={form.location_name}
              onChange={onChangeField}
              placeholder={t('feedback.location')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </div>

          <input
            type="text"
            name="title"
            value={form.title}
            onChange={onChangeField}
            placeholder={t('feedback.titleField')}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            required
          />

          <textarea
            name="details"
            value={form.details}
            onChange={onChangeField}
            rows={4}
            placeholder={t('feedback.details')}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            required
          />

          {postingError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {postingError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? t('feedback.posting') : t('feedback.post')}
          </button>
        </form>
      </Panel>

      <Panel title={t('feedback.feedTitle')} subtitle={t('feedback.feedSub')}>
        <AsyncState loading={loading} error={error}>
          <div className="space-y-3">
            {posts.map((post) => (
              <article key={post.id} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {post.pinned ? '[PIN] ' : ''}
                      {post.title}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {post.author_name}
                      {post.location_name ? ` • ${post.location_name}` : ''}
                      {` • ${formatTimestamp(post.created_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {user?.role === 'admin' ? (
                      <button
                        type="button"
                        onClick={() => onTogglePin(post.id, post.pinned)}
                        className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"
                      >
                        {post.pinned ? 'Unpin' : 'Pin'}
                      </button>
                    ) : null}
                    <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                      <button
                        type="button"
                        onClick={() => onVote(post.id, 1)}
                        disabled={votingPostId === post.id}
                        className={post.my_vote === 1 ? 'font-semibold text-emerald-700' : 'text-slate-700'}
                      >
                        ▲
                      </button>
                      <span className="min-w-[26px] text-center font-semibold">{post.score}</span>
                      <button
                        type="button"
                        onClick={() => onVote(post.id, -1)}
                        disabled={votingPostId === post.id}
                        className={post.my_vote === -1 ? 'font-semibold text-red-700' : 'text-slate-700'}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{post.details}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {t('feedback.upvotes')} {post.upvotes} • {t('feedback.downvotes')} {post.downvotes}
                </p>
              </article>
            ))}

            {!posts.length ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {t('feedback.empty')}
              </div>
            ) : null}
          </div>
        </AsyncState>
      </Panel>
    </div>
  );
}
