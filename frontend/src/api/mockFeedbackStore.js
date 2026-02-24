const STORAGE_KEY = 'tirpe_feedback_mock_store_v1';

function nowIso() {
  return new Date().toISOString();
}

function baseStore() {
  return {
    nextId: 1,
    posts: [],
    votes: {},
  };
}

function safeParseStore(raw) {
  if (!raw || typeof raw !== 'string') {
    return baseStore();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return baseStore();
    }

    if (!Array.isArray(parsed.posts) || typeof parsed.votes !== 'object' || parsed.votes === null) {
      return baseStore();
    }

    return {
      nextId: Number(parsed.nextId) > 0 ? Number(parsed.nextId) : parsed.posts.length + 1,
      posts: parsed.posts,
      votes: parsed.votes,
    };
  } catch {
    return baseStore();
  }
}

function readStore() {
  try {
    return safeParseStore(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return baseStore();
  }
}

function writeStore(store) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // best effort only
  }
}

function calculateVoteSummary(postId, voterId, votesByPost) {
  const postVotes = votesByPost[String(postId)] || {};
  const values = Object.values(postVotes).map((value) => Number(value)).filter((value) => value === 1 || value === -1);
  const upvotes = values.filter((value) => value === 1).length;
  const downvotes = values.filter((value) => value === -1).length;
  const score = upvotes - downvotes;
  const myVote = voterId ? Number(postVotes[voterId] || 0) : 0;

  return {
    upvotes,
    downvotes,
    score,
    my_vote: myVote === 1 || myVote === -1 ? myVote : 0,
  };
}

function normalizePost(post, voterId, votesByPost) {
  return {
    id: Number(post.id),
    author_name: post.author_name,
    title: post.title,
    details: post.details,
    location_name: post.location_name || null,
    pinned: Boolean(post.pinned),
    pinned_at: post.pinned_at || null,
    created_at: post.created_at,
    updated_at: post.updated_at,
    ...calculateVoteSummary(post.id, voterId, votesByPost),
  };
}

export async function listMockFeedbackPosts({ limit = 60, voterId } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 60)));
  const store = readStore();

  const normalized = store.posts
    .map((post) => normalizePost(post, voterId, store.votes))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, safeLimit);

  return normalized;
}

export async function createMockFeedbackPost(payload = {}) {
  const authorName = String(payload.author_name || '').trim();
  const title = String(payload.title || '').trim();
  const details = String(payload.details || '').trim();
  const locationName = String(payload.location_name || '').trim();

  if (!authorName || !title || !details) {
    throw new Error('author_name, title, and details are required');
  }

  const store = readStore();
  const timestamp = nowIso();
  const post = {
    id: store.nextId,
    author_name: authorName,
    title,
    details,
    location_name: locationName || null,
    pinned: false,
    pinned_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  store.nextId += 1;
  store.posts.push(post);
  writeStore(store);

  return normalizePost(post, null, store.votes);
}

export async function voteMockFeedbackPost(postId, payload = {}) {
  const numericPostId = Number(postId);
  const vote = Number(payload.vote);
  const voterId = String(payload.voter_id || '').trim();

  if (!numericPostId) {
    throw new Error('post_id is required');
  }
  if (!voterId) {
    throw new Error('voter_id is required');
  }
  if (vote !== 1 && vote !== -1) {
    throw new Error('vote must be 1 or -1');
  }

  const store = readStore();
  const postExists = store.posts.some((post) => Number(post.id) === numericPostId);
  if (!postExists) {
    throw new Error('feedback post not found');
  }

  const key = String(numericPostId);
  store.votes[key] = store.votes[key] || {};
  store.votes[key][voterId] = vote;
  writeStore(store);

  return {
    id: numericPostId,
    ...calculateVoteSummary(numericPostId, voterId, store.votes),
  };
}

export async function pinMockFeedbackPost(postId, pinned) {
  const numericPostId = Number(postId);
  if (!numericPostId) {
    throw new Error('post_id is required');
  }

  const store = readStore();
  const now = nowIso();
  const target = store.posts.find((post) => Number(post.id) === numericPostId);
  if (!target) {
    throw new Error('feedback post not found');
  }

  target.pinned = Boolean(pinned);
  target.pinned_at = target.pinned ? now : null;
  target.updated_at = now;
  writeStore(store);

  return {
    id: numericPostId,
    pinned: target.pinned,
    pinned_at: target.pinned_at,
  };
}
