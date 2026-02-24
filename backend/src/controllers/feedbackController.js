const {
  createFeedbackPost,
  listFeedbackPosts,
  feedbackPostExists,
  voteFeedbackPost,
  setFeedbackPinned,
} = require('../repositories/feedbackRepository');
const { appendLog } = require('../services/opsLogService');

async function getFeedbackPosts(req, res) {
  const { limit } = req.query;
  const voterId = req.user ? `user:${req.user.id}` : req.query.voter_id;
  const posts = await listFeedbackPosts({
    limit: limit ? Number(limit) : 50,
    voterId: voterId || null,
  });

  return res.json({
    data: posts,
  });
}

async function createPost(req, res) {
  const { title, details, location_name: locationName } = req.body;
  const authorName = req.user.display_name || req.user.username;

  const created = await createFeedbackPost({
    authorUserId: req.user.id,
    authorName,
    title,
    details,
    locationName,
  });

  appendLog({
    level: 'INFO',
    scope: 'feedback',
    message: 'Feedback post created',
    meta: {
      post_id: created.id,
      author_user_id: req.user.id,
      author_name: created.author_name,
      location_name: created.location_name,
    },
  });

  return res.status(201).json({
    data: {
      id: Number(created.id),
      author_user_id: created.author_user_id ? Number(created.author_user_id) : null,
      author_name: created.author_name,
      title: created.title,
      details: created.details,
      location_name: created.location_name,
      pinned: Boolean(created.pinned),
      pinned_at: created.pinned_at || null,
      created_at: created.created_at,
      updated_at: created.updated_at,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      my_vote: 0,
    },
  });
}

async function votePost(req, res) {
  const { post_id: postId } = req.params;
  const { vote } = req.body;
  const voterId = `user:${req.user.id}`;

  const exists = await feedbackPostExists(postId);
  if (!exists) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Feedback post ${postId} not found`,
    });
  }

  const updated = await voteFeedbackPost({
    postId: Number(postId),
    voterId,
    vote: Number(vote),
  });

  appendLog({
    level: 'INFO',
    scope: 'feedback',
    message: 'Feedback vote recorded',
    meta: {
      post_id: Number(postId),
      voter_id: voterId,
      vote: Number(vote),
      score: updated?.score ?? null,
    },
  });

  return res.json({
    data: updated,
  });
}

async function pinPost(req, res) {
  const { post_id: postId } = req.params;
  const { pinned } = req.body;

  const exists = await feedbackPostExists(postId);
  if (!exists) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Feedback post ${postId} not found`,
    });
  }

  const updated = await setFeedbackPinned({
    postId: Number(postId),
    pinned: Boolean(pinned),
    pinnedByUserId: req.user.id,
  });

  appendLog({
    level: 'INFO',
    scope: 'feedback',
    message: updated?.pinned ? 'Feedback post pinned' : 'Feedback post unpinned',
    meta: {
      post_id: Number(postId),
      admin_user_id: req.user.id,
      pinned: Boolean(updated?.pinned),
    },
  });

  return res.json({
    data: updated,
  });
}

module.exports = {
  getFeedbackPosts,
  createPost,
  votePost,
  pinPost,
};
