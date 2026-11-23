import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  addComment,
  createFeedPost,
  createStudyGroup,
  deleteFeedPost,
  getFeed,
  getLeaderboard,
  getStudyGroupDetail,
  joinStudyGroup,
  leaveStudyGroup,
  listFriends,
  listUserGroups,
  removeFriend,
  respondToFriendRequest,
  searchUsers,
  sendFriendRequest,
  toggleCheer
} from '../services/social.js';

export function createSocialRouter(db) {
  const router = express.Router();

  // Friends
  router.get('/friends', requireAuth, (req, res, next) => {
    try {
      const data = listFriends(db, req.user);
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/friends/search', requireAuth, (req, res, next) => {
    try {
      const results = searchUsers(db, req.user, req.query.q);
      res.json({ ok: true, data: { results } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/friends/request', requireAuth, (req, res, next) => {
    try {
      const result = sendFriendRequest(db, req.user, req.body);
      res.status(result.statusCode).json({
        ok: true,
        data: {
          autoAccepted: result.autoAccepted,
          request: result.request
        }
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/friends/requests/:id/respond',
    requireAuth,
    (req, res, next) => {
      try {
        const friendship = respondToFriendRequest(
          db,
          req.user,
          req.params.id,
          req.body?.action
        );
        res.json({ ok: true, data: { friendship } });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete('/friends/:friendUserId', requireAuth, (req, res, next) => {
    try {
      const data = removeFriend(db, req.user, req.params.friendUserId);
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // Study Groups
  router.get('/groups', requireAuth, (req, res, next) => {
    try {
      const groups = listUserGroups(db, req.user);
      res.json({ ok: true, data: { groups } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/groups', requireAuth, (req, res, next) => {
    try {
      const group = createStudyGroup(db, req.user, req.body);
      res.status(201).json({ ok: true, data: { group } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/groups/join', requireAuth, (req, res, next) => {
    try {
      const result = joinStudyGroup(db, req.user, req.body?.inviteCode);
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  router.get('/groups/:groupId', requireAuth, (req, res, next) => {
    try {
      const detail = getStudyGroupDetail(db, req.user, req.params.groupId);
      res.json({ ok: true, data: detail });
    } catch (err) {
      next(err);
    }
  });

  router.post('/groups/:groupId/leave', requireAuth, (req, res, next) => {
    try {
      const result = leaveStudyGroup(db, req.user, req.params.groupId);
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  // Leaderboard
  router.get('/leaderboard', requireAuth, (req, res, next) => {
    try {
      const data = getLeaderboard(db, req.user, {
        scope: req.query.scope ? String(req.query.scope) : 'global',
        groupId: req.query.groupId ? Number(req.query.groupId) : null,
        timeframe: req.query.timeframe
          ? String(req.query.timeframe)
          : 'weekly',
        language: req.query.language ? String(req.query.language) : 'all'
      });
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // Progress Feed
  router.get('/feed', requireAuth, (req, res, next) => {
    try {
      const posts = getFeed(db, req.user, {
        scope: req.query.scope ? String(req.query.scope) : 'all',
        groupId: req.query.groupId ? Number(req.query.groupId) : null,
        limit: req.query.limit ? Number(req.query.limit) : 20
      });
      res.json({ ok: true, data: { posts } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/feed', requireAuth, (req, res, next) => {
    try {
      const post = createFeedPost(db, req.user, req.body);
      res.status(201).json({ ok: true, data: { post } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/feed/:postId/cheer', requireAuth, (req, res, next) => {
    try {
      const data = toggleCheer(
        db,
        req.user,
        req.params.postId,
        req.body?.reaction
      );
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/feed/:postId/comments', requireAuth, (req, res, next) => {
    try {
      const comment = addComment(
        db,
        req.user,
        req.params.postId,
        req.body?.body
      );
      res.status(201).json({ ok: true, data: { comment } });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/feed/:postId', requireAuth, (req, res, next) => {
    try {
      const data = deleteFeedPost(db, req.user, req.params.postId);
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
