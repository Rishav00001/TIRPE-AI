const db = require('../config/db');

async function createFeedbackPost({ authorUserId = null, authorName, title, details, locationName }) {
  const result = await db.query(
    `
      INSERT INTO feedback_posts (
        author_user_id,
        author_name,
        title,
        details,
        location_name
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, author_user_id, author_name, title, details, location_name, pinned, pinned_at, created_at, updated_at;
    `,
    [authorUserId || null, authorName, title, details, locationName || null],
  );

  return result.rows[0];
}

async function listFeedbackPosts({ limit = 50, voterId = null }) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 50)));
  const result = await db.query(
    `
      SELECT p.id,
             p.author_user_id,
             p.author_name,
             p.title,
             p.details,
             p.location_name,
             p.pinned,
             p.pinned_at,
             p.created_at,
             p.updated_at,
             COALESCE(COUNT(v.id) FILTER (WHERE v.vote = 1), 0)::int AS upvotes,
             COALESCE(COUNT(v.id) FILTER (WHERE v.vote = -1), 0)::int AS downvotes,
             (COALESCE(COUNT(v.id) FILTER (WHERE v.vote = 1), 0) - COALESCE(COUNT(v.id) FILTER (WHERE v.vote = -1), 0))::int AS score,
             COALESCE((
               SELECT fv.vote
               FROM feedback_votes fv
               WHERE fv.post_id = p.id
                 AND fv.voter_id = $2
               LIMIT 1
             ), 0)::int AS my_vote
      FROM feedback_posts p
      LEFT JOIN feedback_votes v ON v.post_id = p.id
      GROUP BY p.id
      ORDER BY p.pinned DESC, score DESC, p.created_at DESC
      LIMIT $1;
    `,
    [safeLimit, voterId || ''],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    author_user_id: row.author_user_id ? Number(row.author_user_id) : null,
    author_name: row.author_name,
    title: row.title,
    details: row.details,
    location_name: row.location_name,
    pinned: Boolean(row.pinned),
    pinned_at: row.pinned_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    upvotes: Number(row.upvotes || 0),
    downvotes: Number(row.downvotes || 0),
    score: Number(row.score || 0),
    my_vote: Number(row.my_vote || 0),
  }));
}

async function feedbackPostExists(postId) {
  const result = await db.query(
    `
      SELECT 1
      FROM feedback_posts
      WHERE id = $1
      LIMIT 1;
    `,
    [postId],
  );

  return Boolean(result.rows[0]);
}

async function voteFeedbackPost({ postId, voterId, vote }) {
  await db.query(
    `
      INSERT INTO feedback_votes (post_id, voter_id, vote)
      VALUES ($1, $2, $3)
      ON CONFLICT (post_id, voter_id)
      DO UPDATE SET
        vote = EXCLUDED.vote,
        updated_at = NOW();
    `,
    [postId, voterId, vote],
  );

  const result = await db.query(
    `
      SELECT p.id,
             COALESCE(COUNT(v.id) FILTER (WHERE v.vote = 1), 0)::int AS upvotes,
             COALESCE(COUNT(v.id) FILTER (WHERE v.vote = -1), 0)::int AS downvotes,
             (COALESCE(COUNT(v.id) FILTER (WHERE v.vote = 1), 0) - COALESCE(COUNT(v.id) FILTER (WHERE v.vote = -1), 0))::int AS score,
             COALESCE((
               SELECT fv.vote
               FROM feedback_votes fv
               WHERE fv.post_id = p.id
                 AND fv.voter_id = $2
               LIMIT 1
             ), 0)::int AS my_vote
      FROM feedback_posts p
      LEFT JOIN feedback_votes v ON v.post_id = p.id
      WHERE p.id = $1
      GROUP BY p.id
      LIMIT 1;
    `,
    [postId, voterId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    upvotes: Number(row.upvotes || 0),
    downvotes: Number(row.downvotes || 0),
    score: Number(row.score || 0),
    my_vote: Number(row.my_vote || 0),
  };
}

async function setFeedbackPinned({
  postId,
  pinned,
  pinnedByUserId,
}) {
  const result = await db.query(
    `
      UPDATE feedback_posts
      SET pinned = $2,
          pinned_by_user_id = CASE WHEN $2 THEN $3 ELSE NULL END,
          pinned_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, pinned, pinned_at;
    `,
    [postId, pinned, pinnedByUserId || null],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    pinned: Boolean(row.pinned),
    pinned_at: row.pinned_at || null,
  };
}

module.exports = {
  createFeedbackPost,
  listFeedbackPosts,
  feedbackPostExists,
  voteFeedbackPost,
  setFeedbackPinned,
};
