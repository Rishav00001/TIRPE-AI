const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { optionalAuth, requireAuth, requireAdmin } = require('../middleware/auth');
const {
  getFeedbackPosts,
  createPost,
  votePost,
  pinPost,
} = require('../controllers/feedbackController');

const router = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  voter_id: z.string().trim().min(6).max(120).optional(),
});

const postSchema = z.object({
  title: z.string().trim().min(2).max(180),
  details: z.string().trim().min(2).max(6000),
  location_name: z.string().trim().min(1).max(160).optional(),
});

const voteParamsSchema = z.object({
  post_id: z.coerce.number().int().positive(),
});

const voteBodySchema = z.object({
  vote: z.union([z.literal(1), z.literal(-1)]),
});

const pinBodySchema = z.object({
  pinned: z.boolean(),
});

router.get('/posts', optionalAuth, validate(listQuerySchema, 'query'), getFeedbackPosts);
router.post('/posts', requireAuth, validate(postSchema), createPost);
router.post('/posts/:post_id/vote', requireAuth, validate(voteParamsSchema, 'params'), validate(voteBodySchema), votePost);
router.post('/posts/:post_id/pin', requireAuth, requireAdmin, validate(voteParamsSchema, 'params'), validate(pinBodySchema), pinPost);

module.exports = router;
