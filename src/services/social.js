import crypto from 'node:crypto';
import {
  AppError,
  addDaysToDateString,
  computeEffectiveStreak,
  getLocalDateString
} from './progression.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode(prefix, length = 4) {
  let body = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${prefix}-${body}`;
}

function generateUniqueInviteCode(db) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode('GRP', 4);
    const exists = db
      .prepare('SELECT 1 FROM study_groups WHERE invite_code = ?')
      .get(code);
    if (!exists) return code;
  }
  return generateCode('GRP', 6);
}

function formatPublicUser(row, todayDate) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    friendCode: row.friend_code,
    avatarColor: row.avatar_color,
    activeLanguage: row.active_language,
    totalXp: row.total_xp ?? 0,
    currentStreak: computeEffectiveStreak(
      {
        currentStreak: row.current_streak ?? 0,
        lastActiveDate: row.last_active_date ?? null
      },
      todayDate
    ),
    lessonsCompleted: row.lessons_completed_count ?? 0
  };
}

export function listFriends(db, currentUser) {
  const today = getLocalDateString(currentUser.timezoneOffsetMin);
  const rows = db
    .prepare(
      `SELECT f.*,
              u.id AS other_id, u.username, u.display_name, u.friend_code, u.avatar_color, u.active_language,
              us.total_xp, us.current_streak, us.last_active_date, us.lessons_completed_count
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
       LEFT JOIN user_stats us ON us.user_id = u.id
       WHERE (f.user_a_id = ? OR f.user_b_id = ?) AND f.status IN ('accepted', 'pending')
       ORDER BY f.created_at DESC, f.id DESC`
    )
    .all(currentUser.id, currentUser.id, currentUser.id);

  const friends = [];
  const incomingRequests = [];
  const outgoingRequests = [];

  for (const row of rows) {
    const otherUser = formatPublicUser(
      { ...row, id: row.other_id },
      today
    );
    if (row.status === 'accepted') {
      friends.push({
        friendshipId: row.id,
        since: row.responded_at || row.created_at,
        ...otherUser
      });
    } else if (row.status === 'pending') {
      const reqObj = {
        id: row.id,
        requesterId: row.requester_id,
        createdAt: row.created_at,
        user: otherUser
      };
      if (row.requester_id === currentUser.id) {
        outgoingRequests.push(reqObj);
      } else {
        incomingRequests.push(reqObj);
      }
    }
  }

  return {
    friendCode: currentUser.friendCode,
    friends,
    incomingRequests,
    outgoingRequests
  };
}

export function searchUsers(db, currentUser, query) {
  const q = String(query ?? '').trim();
  if (!q) {
    return [];
  }
  const today = getLocalDateString(currentUser.timezoneOffsetMin);
  const pattern = `%${q}%`;
  const upperCode = q.toUpperCase();

  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.friend_code, u.avatar_color, u.active_language,
              us.total_xp, us.current_streak, us.last_active_date, us.lessons_completed_count,
              f.status AS rel_status, f.requester_id AS rel_requester_id
       FROM users u
       LEFT JOIN user_stats us ON us.user_id = u.id
       LEFT JOIN friendships f
         ON f.user_a_id = MIN(u.id, ?) AND f.user_b_id = MAX(u.id, ?)
       WHERE u.id != ?
         AND (u.username LIKE ? COLLATE NOCASE
           OR u.display_name LIKE ? COLLATE NOCASE
           OR u.friend_code = ?)
       ORDER BY us.total_xp DESC, u.username ASC
       LIMIT 15`
    )
    .all(currentUser.id, currentUser.id, currentUser.id, pattern, pattern, upperCode);

  return rows.map((row) => {
    let relationshipStatus = 'none';
    if (row.rel_status === 'accepted') {
      relationshipStatus = 'accepted';
    } else if (row.rel_status === 'pending') {
      relationshipStatus =
        row.rel_requester_id === currentUser.id ? 'pending_out' : 'pending_in';
    }
    return {
      ...formatPublicUser(row, today),
      relationshipStatus
    };
  });
}

export function sendFriendRequest(db, currentUser, payload) {
  const { targetUserId, friendCode, username } = payload || {};
  let targetRow = null;

  if (targetUserId !== undefined && targetUserId !== null) {
    targetRow = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(Number(targetUserId));
  } else if (friendCode) {
    targetRow = db
      .prepare('SELECT * FROM users WHERE friend_code = ?')
      .get(String(friendCode).trim().toUpperCase());
  } else if (username) {
    targetRow = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(String(username).trim());
  } else {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Provide targetUserId, friendCode, or username'
    );
  }

  if (!targetRow) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Target user not found');
  }
  if (targetRow.id === currentUser.id) {
    throw new AppError(
      400,
      'SELF_FRIEND_REQUEST',
      'You cannot send a friend request to yourself'
    );
  }

  const userA = Math.min(currentUser.id, targetRow.id);
  const userB = Math.max(currentUser.id, targetRow.id);

  const existing = db
    .prepare(
      'SELECT * FROM friendships WHERE user_a_id = ? AND user_b_id = ?'
    )
    .get(userA, userB);

  if (existing) {
    if (existing.status === 'accepted') {
      throw new AppError(409, 'ALREADY_FRIENDS', 'You are already friends');
    }
    if (existing.status === 'pending') {
      if (existing.requester_id === currentUser.id) {
        throw new AppError(
          409,
          'REQUEST_ALREADY_SENT',
          'Friend request is already pending'
        );
      }
      // Mutual request -> auto-accept
      db.prepare(
        `UPDATE friendships
         SET status = 'accepted', responded_at = datetime('now')
         WHERE id = ?`
      ).run(existing.id);

      const updated = db
        .prepare('SELECT * FROM friendships WHERE id = ?')
        .get(existing.id);
      return {
        statusCode: 200,
        autoAccepted: true,
        request: updated
      };
    }

    // Previously declined -> reset to pending
    db.prepare(
      `UPDATE friendships
       SET requester_id = ?, status = 'pending', created_at = datetime('now'), responded_at = NULL
       WHERE id = ?`
    ).run(currentUser.id, existing.id);
    const updated = db
      .prepare('SELECT * FROM friendships WHERE id = ?')
      .get(existing.id);
    return {
      statusCode: 201,
      autoAccepted: false,
      request: updated
    };
  }

  const info = db
    .prepare(
      `INSERT INTO friendships (user_a_id, user_b_id, requester_id, status)
       VALUES (?, ?, ?, 'pending')`
    )
    .run(userA, userB, currentUser.id);

  const created = db
    .prepare('SELECT * FROM friendships WHERE id = ?')
    .get(info.lastInsertRowid);

  return {
    statusCode: 201,
    autoAccepted: false,
    request: created
  };
}

export function respondToFriendRequest(db, currentUser, requestId, action) {
  if (!['accept', 'decline'].includes(action)) {
    throw new AppError(
      400,
      'INVALID_ACTION',
      "action must be 'accept' or 'decline'"
    );
  }

  const row = db
    .prepare('SELECT * FROM friendships WHERE id = ?')
    .get(Number(requestId));
  if (!row) {
    throw new AppError(404, 'REQUEST_NOT_FOUND', 'Friend request not found');
  }

  const isParticipant =
    row.user_a_id === currentUser.id || row.user_b_id === currentUser.id;
  if (!isParticipant || row.requester_id === currentUser.id) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Only the recipient can respond to this friend request'
    );
  }
  if (row.status !== 'pending') {
    throw new AppError(
      409,
      'REQUEST_ALREADY_HANDLED',
      'This friend request has already been handled'
    );
  }

  const nextStatus = action === 'accept' ? 'accepted' : 'declined';
  db.prepare(
    `UPDATE friendships
     SET status = ?, responded_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, row.id);

  return db.prepare('SELECT * FROM friendships WHERE id = ?').get(row.id);
}

export function removeFriend(db, currentUser, friendUserId) {
  const otherId = Number(friendUserId);
  if (!Number.isInteger(otherId) || otherId <= 0) {
    throw new AppError(400, 'INVALID_USER_ID', 'Invalid friend user ID');
  }
  const userA = Math.min(currentUser.id, otherId);
  const userB = Math.max(currentUser.id, otherId);

  const info = db
    .prepare('DELETE FROM friendships WHERE user_a_id = ? AND user_b_id = ?')
    .run(userA, userB);

  if (info.changes === 0) {
    throw new AppError(404, 'FRIENDSHIP_NOT_FOUND', 'Friendship not found');
  }
  return { removed: true };
}

function getGroupXpStats(db, groupId, todayDate) {
  const weekStart = addDaysToDateString(todayDate, -6);

  const dailyRow = db
    .prepare(
      `SELECT COALESCE(SUM(dal.xp_earned), 0) AS xp
       FROM study_group_members sgm
       JOIN daily_activity_log dal
         ON dal.user_id = sgm.user_id AND dal.activity_date = ?
       WHERE sgm.group_id = ?`
    )
    .get(todayDate, groupId);

  const weeklyRow = db
    .prepare(
      `SELECT COALESCE(SUM(dal.xp_earned), 0) AS xp
       FROM study_group_members sgm
       JOIN daily_activity_log dal
         ON dal.user_id = sgm.user_id AND dal.activity_date >= ? AND dal.activity_date <= ?
       WHERE sgm.group_id = ?`
    )
    .get(weekStart, todayDate, groupId);

  return {
    collectiveDailyXp: dailyRow?.xp ?? 0,
    collectiveWeeklyXp: weeklyRow?.xp ?? 0
  };
}

function formatGroup(row, xpStats = {}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    focusLanguage: row.focus_language,
    inviteCode: row.invite_code,
    dailyGroupXpGoal: row.daily_group_xp_goal,
    weeklyGroupXpGoal: row.weekly_group_xp_goal,
    ownerId: row.owner_id,
    role: row.role ?? undefined,
    memberCount: row.member_count ?? undefined,
    collectiveDailyXp: xpStats.collectiveDailyXp ?? 0,
    collectiveWeeklyXp: xpStats.collectiveWeeklyXp ?? 0,
    createdAt: row.created_at
  };
}

export function listUserGroups(db, currentUser) {
  const today = getLocalDateString(currentUser.timezoneOffsetMin);
  const rows = db
    .prepare(
      `SELECT sg.*, sgm.role,
              (SELECT COUNT(*) FROM study_group_members m WHERE m.group_id = sg.id) AS member_count
       FROM study_groups sg
       JOIN study_group_members sgm ON sgm.group_id = sg.id
       WHERE sgm.user_id = ?
       ORDER BY sg.created_at DESC, sg.id DESC`
    )
    .all(currentUser.id);

  return rows.map((row) =>
    formatGroup(row, getGroupXpStats(db, row.id, today))
  );
}

export function createStudyGroup(db, currentUser, payload) {
  const name = String(payload?.name ?? '').trim();
  const description = String(payload?.description ?? '').trim();
  const focusLanguage = payload?.focusLanguage || 'all';
  const dailyGroupXpGoal =
    payload?.dailyGroupXpGoal !== undefined
      ? Number(payload.dailyGroupXpGoal)
      : 200;
  const weeklyGroupXpGoal =
    payload?.weeklyGroupXpGoal !== undefined
      ? Number(payload.weeklyGroupXpGoal)
      : 1000;

  if (name.length < 2 || name.length > 60) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Group name must be between 2 and 60 characters'
    );
  }
  if (!['all', 'en', 'zh', 'ja'].includes(focusLanguage)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      "focusLanguage must be 'all', 'en', 'zh', or 'ja'"
    );
  }
  if (
    !Number.isFinite(dailyGroupXpGoal) ||
    dailyGroupXpGoal < 20 ||
    dailyGroupXpGoal > 10000
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'dailyGroupXpGoal must be between 20 and 10000'
    );
  }
  if (
    !Number.isFinite(weeklyGroupXpGoal) ||
    weeklyGroupXpGoal < 50 ||
    weeklyGroupXpGoal > 50000
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'weeklyGroupXpGoal must be between 50 and 50000'
    );
  }

  let groupId;
  db.exec('BEGIN');
  try {
    const inviteCode = generateUniqueInviteCode(db);
    const info = db
      .prepare(
        `INSERT INTO study_groups
          (name, description, focus_language, invite_code, daily_group_xp_goal, weekly_group_xp_goal, owner_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        description,
        focusLanguage,
        inviteCode,
        Math.round(dailyGroupXpGoal),
        Math.round(weeklyGroupXpGoal),
        currentUser.id
      );

    groupId = info.lastInsertRowid;
    db.prepare(
      `INSERT INTO study_group_members (group_id, user_id, role)
       VALUES (?, ?, 'owner')`
    ).run(groupId, currentUser.id);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const today = getLocalDateString(currentUser.timezoneOffsetMin);
  const row = db
    .prepare(
      `SELECT sg.*, 'owner' AS role, 1 AS member_count
       FROM study_groups sg
       WHERE sg.id = ?`
    )
    .get(groupId);

  return formatGroup(row, getGroupXpStats(db, groupId, today));
}

export function joinStudyGroup(db, currentUser, inviteCode) {
  const code = String(inviteCode ?? '').trim().toUpperCase();
  if (!code) {
    throw new AppError(400, 'VALIDATION_ERROR', 'inviteCode is required');
  }

  const groupRow = db
    .prepare('SELECT * FROM study_groups WHERE invite_code = ?')
    .get(code);
  if (!groupRow) {
    throw new AppError(
      404,
      'GROUP_NOT_FOUND',
      'No study group matches that invite code'
    );
  }

  const existing = db
    .prepare(
      'SELECT role FROM study_group_members WHERE group_id = ? AND user_id = ?'
    )
    .get(groupRow.id, currentUser.id);

  let alreadyMember = false;
  if (existing) {
    alreadyMember = true;
  } else {
    db.prepare(
      `INSERT INTO study_group_members (group_id, user_id, role)
       VALUES (?, ?, 'member')`
    ).run(groupRow.id, currentUser.id);
  }

  const today = getLocalDateString(currentUser.timezoneOffsetMin);
  const memberCount = db
    .prepare(
      'SELECT COUNT(*) AS cnt FROM study_group_members WHERE group_id = ?'
    )
    .get(groupRow.id).cnt;

  return {
    alreadyMember,
    group: formatGroup(
      {
        ...groupRow,
        role: existing?.role || 'member',
        member_count: memberCount
      },
      getGroupXpStats(db, groupRow.id, today)
    )
  };
}

export function getStudyGroupDetail(db, currentUser, groupId) {
  const id = Number(groupId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'INVALID_GROUP_ID', 'Invalid group ID');
  }

  const groupRow = db.prepare('SELECT * FROM study_groups WHERE id = ?').get(id);
  if (!groupRow) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'Study group not found');
  }

  const membership = db
    .prepare(
      'SELECT role FROM study_group_members WHERE group_id = ? AND user_id = ?'
    )
    .get(id, currentUser.id);
  if (!membership) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'You must be a member of this study group to view its details'
    );
  }

  const today = getLocalDateString(currentUser.timezoneOffsetMin);
  const weekStart = addDaysToDateString(today, -6);

  const memberRows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_color, u.active_language, u.friend_code,
              sgm.role, sgm.joined_at,
              us.total_xp, us.current_streak, us.last_active_date, us.lessons_completed_count,
              COALESCE((SELECT xp_earned FROM daily_activity_log d WHERE d.user_id = u.id AND d.activity_date = ?), 0) AS daily_xp,
              COALESCE((SELECT SUM(xp_earned) FROM daily_activity_log d WHERE d.user_id = u.id AND d.activity_date >= ? AND d.activity_date <= ?), 0) AS weekly_xp
       FROM study_group_members sgm
       JOIN users u ON u.id = sgm.user_id
       LEFT JOIN user_stats us ON us.user_id = u.id
       WHERE sgm.group_id = ?
       ORDER BY weekly_xp DESC, total_xp DESC, u.id ASC`
    )
    .all(today, weekStart, today, id);

  const members = memberRows.map((m) => ({
    ...formatPublicUser(m, today),
    role: m.role,
    joinedAt: m.joined_at,
    dailyXp: m.daily_xp,
    weeklyXp: m.weekly_xp
  }));

  const xpStats = getGroupXpStats(db, id, today);
  const feed = getFeed(db, currentUser, {
    scope: 'group',
    groupId: id,
    limit: 20
  });

  return {
    group: formatGroup(
      { ...groupRow, role: membership.role, member_count: members.length },
      xpStats
    ),
    collectiveDailyXp: xpStats.collectiveDailyXp,
    collectiveWeeklyXp: xpStats.collectiveWeeklyXp,
    members,
    feed
  };
}

export function leaveStudyGroup(db, currentUser, groupId) {
  const id = Number(groupId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'INVALID_GROUP_ID', 'Invalid group ID');
  }

  const membership = db
    .prepare(
      'SELECT role FROM study_group_members WHERE group_id = ? AND user_id = ?'
    )
    .get(id, currentUser.id);
  if (!membership) {
    throw new AppError(
      404,
      'MEMBERSHIP_NOT_FOUND',
      'You are not a member of this group'
    );
  }

  db.exec('BEGIN');
  try {
    db.prepare(
      'DELETE FROM study_group_members WHERE group_id = ? AND user_id = ?'
    ).run(id, currentUser.id);

    const remaining = db
      .prepare(
        'SELECT user_id FROM study_group_members WHERE group_id = ? ORDER BY joined_at ASC LIMIT 1'
      )
      .get(id);

    if (!remaining) {
      db.prepare('DELETE FROM study_groups WHERE id = ?').run(id);
    } else if (membership.role === 'owner') {
      db.prepare(
        "UPDATE study_group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?"
      ).run(id, remaining.user_id);
      db.prepare('UPDATE study_groups SET owner_id = ? WHERE id = ?').run(
        remaining.user_id,
        id
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { left: true };
}

export function getLeaderboard(
  db,
  currentUser,
  { scope = 'global', groupId = null, timeframe = 'weekly', language = 'all' }
) {
  if (!['global', 'friends', 'group'].includes(scope)) {
    throw new AppError(
      400,
      'INVALID_SCOPE',
      "scope must be 'global', 'friends', or 'group'"
    );
  }
  if (!['daily', 'weekly', 'all_time'].includes(timeframe)) {
    throw new AppError(
      400,
      'INVALID_TIMEFRAME',
      "timeframe must be 'daily', 'weekly', or 'all_time'"
    );
  }
  if (!['all', 'en', 'zh', 'ja'].includes(language)) {
    throw new AppError(
      400,
      'INVALID_LANGUAGE',
      "language must be 'all', 'en', 'zh', or 'ja'"
    );
  }

  const today = getLocalDateString(currentUser.timezoneOffsetMin);
  const weekStart = addDaysToDateString(today, -6);

  let parsedGroupId = null;
  if (scope === 'group') {
    parsedGroupId = Number(groupId);
    if (!Number.isInteger(parsedGroupId) || parsedGroupId <= 0) {
      throw new AppError(
        400,
        'GROUP_ID_REQUIRED',
        'Valid groupId is required for group leaderboard'
      );
    }
    const isMember = db
      .prepare(
        'SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?'
      )
      .get(parsedGroupId, currentUser.id);
    if (!isMember) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You must be a member of the study group to view its leaderboard'
      );
    }
  }

  const statsCol =
    language === 'all'
      ? 'total_xp'
      : language === 'en'
        ? 'en_xp'
        : language === 'zh'
          ? 'zh_xp'
          : 'ja_xp';
  const dailyCol =
    language === 'all'
      ? 'xp_earned'
      : language === 'en'
        ? 'en_xp'
        : language === 'zh'
          ? 'zh_xp'
          : 'ja_xp';

  let xpExpr;
  const params = [];

  if (timeframe === 'all_time') {
    xpExpr = `COALESCE(us.${statsCol}, 0)`;
  } else if (timeframe === 'daily') {
    xpExpr = `COALESCE((SELECT dal.${dailyCol} FROM daily_activity_log dal WHERE dal.user_id = u.id AND dal.activity_date = ?), 0)`;
    params.push(today);
  } else {
    xpExpr = `COALESCE((SELECT SUM(dal.${dailyCol}) FROM daily_activity_log dal WHERE dal.user_id = u.id AND dal.activity_date >= ? AND dal.activity_date <= ?), 0)`;
    params.push(weekStart, today);
  }

  let scopeWhere = '1=1';
  if (scope === 'friends') {
    scopeWhere = `(u.id = ? OR u.id IN (
      SELECT CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
      FROM friendships f
      WHERE (f.user_a_id = ? OR f.user_b_id = ?) AND f.status = 'accepted'
    ))`;
    params.push(currentUser.id, currentUser.id, currentUser.id, currentUser.id);
  } else if (scope === 'group') {
    scopeWhere = `u.id IN (SELECT user_id FROM study_group_members WHERE group_id = ?)`;
    params.push(parsedGroupId);
  }

  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_color, u.active_language,
              us.total_xp, us.current_streak, us.last_active_date, us.lessons_completed_count,
              ${xpExpr} AS xp
       FROM users u
       LEFT JOIN user_stats us ON us.user_id = u.id
       WHERE ${scopeWhere}
       ORDER BY xp DESC, COALESCE(us.total_xp, 0) DESC, COALESCE(us.lessons_completed_count, 0) DESC, u.id ASC
       LIMIT 50`
    )
    .all(...params);

  const entries = rows.map((row, idx) => ({
    rank: idx + 1,
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    xp: row.xp,
    currentStreak: computeEffectiveStreak(
      {
        currentStreak: row.current_streak ?? 0,
        lastActiveDate: row.last_active_date ?? null
      },
      today
    ),
    lessonsCompleted: row.lessons_completed_count ?? 0,
    activeLanguage: row.active_language,
    isCurrentUser: row.id === currentUser.id
  }));

  return {
    scope,
    timeframe,
    language,
    entries
  };
}

function canViewPost(db, viewerId, post) {
  if (post.author_id === viewerId) return true;
  if (post.visibility === 'public') return true;
  if (post.visibility === 'friends') {
    const userA = Math.min(viewerId, post.author_id);
    const userB = Math.max(viewerId, post.author_id);
    const rel = db
      .prepare(
        "SELECT 1 FROM friendships WHERE user_a_id = ? AND user_b_id = ? AND status = 'accepted'"
      )
      .get(userA, userB);
    return Boolean(rel);
  }
  if (post.visibility === 'group' && post.group_id) {
    const member = db
      .prepare(
        'SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?'
      )
      .get(post.group_id, viewerId);
    return Boolean(member);
  }
  return false;
}

function hydrateFeedPosts(db, viewerId, postRows) {
  if (postRows.length === 0) return [];
  const postIds = postRows.map((p) => p.id);
  const placeholders = postIds.map(() => '?').join(',');

  const cheerCounts = new Map();
  for (const row of db
    .prepare(
      `SELECT post_id, COUNT(*) AS cnt FROM feed_cheers WHERE post_id IN (${placeholders}) GROUP BY post_id`
    )
    .all(...postIds)) {
    cheerCounts.set(row.post_id, row.cnt);
  }

  const cheeredSet = new Set(
    db
      .prepare(
        `SELECT post_id FROM feed_cheers WHERE user_id = ? AND post_id IN (${placeholders})`
      )
      .all(viewerId, ...postIds)
      .map((r) => r.post_id)
  );

  const commentsByPost = new Map();
  for (const c of db
    .prepare(
      `SELECT fc.id, fc.post_id, fc.author_id, fc.body, fc.created_at,
              u.username, u.display_name, u.avatar_color
       FROM feed_comments fc
       JOIN users u ON u.id = fc.author_id
       WHERE fc.post_id IN (${placeholders})
       ORDER BY fc.created_at ASC, fc.id ASC`
    )
    .all(...postIds)) {
    if (!commentsByPost.has(c.post_id)) commentsByPost.set(c.post_id, []);
    commentsByPost.get(c.post_id).push({
      id: c.id,
      postId: c.post_id,
      authorId: c.author_id,
      body: c.body,
      createdAt: c.created_at,
      author: {
        id: c.author_id,
        username: c.username,
        displayName: c.display_name,
        avatarColor: c.avatar_color
      }
    });
  }

  return postRows.map((p) => {
    let metadata = {};
    try {
      metadata = JSON.parse(p.metadata_json || '{}');
    } catch {
      metadata = {};
    }
    return {
      id: p.id,
      authorId: p.author_id,
      author: {
        id: p.author_id,
        username: p.author_username,
        displayName: p.author_display_name,
        avatarColor: p.author_avatar_color
      },
      postType: p.post_type,
      visibility: p.visibility,
      groupId: p.group_id,
      groupName: p.group_name ?? null,
      language: p.language,
      levelCode: p.level_code,
      lessonId: p.lesson_id,
      title: p.title,
      body: p.body,
      metadata,
      cheerCount: cheerCounts.get(p.id) || 0,
      cheeredByMe: cheeredSet.has(p.id),
      comments: commentsByPost.get(p.id) || [],
      createdAt: p.created_at
    };
  });
}

export function getFeed(
  db,
  currentUser,
  { scope = 'all', groupId = null, limit = 20 } = {}
) {
  if (!['all', 'friends', 'group'].includes(scope)) {
    throw new AppError(
      400,
      'INVALID_SCOPE',
      "scope must be 'all', 'friends', or 'group'"
    );
  }
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));

  let whereSql;
  const params = [];

  if (scope === 'group') {
    const parsedGroupId = Number(groupId);
    if (!Number.isInteger(parsedGroupId) || parsedGroupId <= 0) {
      throw new AppError(
        400,
        'GROUP_ID_REQUIRED',
        'Valid groupId is required for group feed'
      );
    }
    const isMember = db
      .prepare(
        'SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?'
      )
      .get(parsedGroupId, currentUser.id);
    if (!isMember) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You must be a member of this group to view its feed'
      );
    }
    whereSql = "fp.visibility = 'group' AND fp.group_id = ?";
    params.push(parsedGroupId);
  } else if (scope === 'friends') {
    whereSql = `(
      (fp.author_id = ? AND fp.visibility IN ('friends', 'public'))
      OR (
        fp.visibility IN ('friends', 'public') AND fp.author_id IN (
          SELECT CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
          FROM friendships f
          WHERE (f.user_a_id = ? OR f.user_b_id = ?) AND f.status = 'accepted'
        )
      )
    )`;
    params.push(currentUser.id, currentUser.id, currentUser.id, currentUser.id);
  } else {
    whereSql = `(
      fp.author_id = ?
      OR fp.visibility = 'public'
      OR (
        fp.visibility = 'friends' AND fp.author_id IN (
          SELECT CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
          FROM friendships f
          WHERE (f.user_a_id = ? OR f.user_b_id = ?) AND f.status = 'accepted'
        )
      )
      OR (
        fp.visibility = 'group' AND fp.group_id IN (
          SELECT sgm.group_id FROM study_group_members sgm WHERE sgm.user_id = ?
        )
      )
    )`;
    params.push(
      currentUser.id,
      currentUser.id,
      currentUser.id,
      currentUser.id,
      currentUser.id
    );
  }

  params.push(safeLimit);

  const postRows = db
    .prepare(
      `SELECT fp.*,
              u.username AS author_username,
              u.display_name AS author_display_name,
              u.avatar_color AS author_avatar_color,
              sg.name AS group_name
       FROM feed_posts fp
       JOIN users u ON u.id = fp.author_id
       LEFT JOIN study_groups sg ON sg.id = fp.group_id
       WHERE ${whereSql}
       ORDER BY fp.created_at DESC, fp.id DESC
       LIMIT ?`
    )
    .all(...params);

  return hydrateFeedPosts(db, currentUser.id, postRows);
}

export function createFeedPost(db, currentUser, payload) {
  const postType = payload?.postType || 'study_note';
  const groupId =
    payload?.groupId !== undefined && payload?.groupId !== null
      ? Number(payload.groupId)
      : null;
  const visibility =
    payload?.visibility || (groupId ? 'group' : 'friends');
  const language = payload?.language || null;
  const levelCode = payload?.levelCode ? String(payload.levelCode) : null;
  const lessonId = payload?.lessonId ? String(payload.lessonId) : null;
  const title = String(payload?.title ?? '').trim();
  const body = String(payload?.body ?? '').trim();

  if (
    ![
      'lesson_completed',
      'level_milestone',
      'streak_milestone',
      'study_note'
    ].includes(postType)
  ) {
    throw new AppError(400, 'INVALID_POST_TYPE', 'Invalid postType');
  }
  if (!['friends', 'group', 'public'].includes(visibility)) {
    throw new AppError(400, 'INVALID_VISIBILITY', 'Invalid visibility');
  }
  if (language && !['en', 'zh', 'ja'].includes(language)) {
    throw new AppError(400, 'INVALID_LANGUAGE', 'Invalid language');
  }
  if (title.length < 1 || title.length > 140) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Post title must be between 1 and 140 characters'
    );
  }
  if (body.length > 1000) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Post body must be at most 1000 characters'
    );
  }

  if (visibility === 'group') {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      throw new AppError(
        400,
        'GROUP_ID_REQUIRED',
        'groupId is required when visibility is group'
      );
    }
    const isMember = db
      .prepare(
        'SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?'
      )
      .get(groupId, currentUser.id);
    if (!isMember) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You must be a member of this group to post to it'
      );
    }
  }

  const info = db
    .prepare(
      `INSERT INTO feed_posts
        (author_id, post_type, visibility, group_id, language, level_code, lesson_id, title, body, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      currentUser.id,
      postType,
      visibility,
      visibility === 'group' ? groupId : null,
      language,
      levelCode,
      lessonId,
      title,
      body,
      JSON.stringify(payload?.metadata || {})
    );

  const row = db
    .prepare(
      `SELECT fp.*,
              u.username AS author_username,
              u.display_name AS author_display_name,
              u.avatar_color AS author_avatar_color,
              sg.name AS group_name
       FROM feed_posts fp
       JOIN users u ON u.id = fp.author_id
       LEFT JOIN study_groups sg ON sg.id = fp.group_id
       WHERE fp.id = ?`
    )
    .get(info.lastInsertRowid);

  return hydrateFeedPosts(db, currentUser.id, [row])[0];
}

export function toggleCheer(db, currentUser, postId, reaction = 'cheer') {
  const id = Number(postId);
  const post = db.prepare('SELECT * FROM feed_posts WHERE id = ?').get(id);
  if (!post) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Feed post not found');
  }
  if (!canViewPost(db, currentUser.id, post)) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot interact with this post');
  }

  const existing = db
    .prepare('SELECT 1 FROM feed_cheers WHERE post_id = ? AND user_id = ?')
    .get(id, currentUser.id);

  let cheered;
  if (existing) {
    db.prepare('DELETE FROM feed_cheers WHERE post_id = ? AND user_id = ?').run(
      id,
      currentUser.id
    );
    cheered = false;
  } else {
    db.prepare(
      'INSERT INTO feed_cheers (post_id, user_id, reaction) VALUES (?, ?, ?)'
    ).run(id, currentUser.id, String(reaction || 'cheer').slice(0, 24));
    cheered = true;
  }

  const countRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM feed_cheers WHERE post_id = ?')
    .get(id);

  return {
    postId: id,
    cheered,
    cheerCount: countRow.cnt
  };
}

export function addComment(db, currentUser, postId, bodyText) {
  const id = Number(postId);
  const body = String(bodyText ?? '').trim();
  if (body.length < 1 || body.length > 500) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Comment must be between 1 and 500 characters'
    );
  }

  const post = db.prepare('SELECT * FROM feed_posts WHERE id = ?').get(id);
  if (!post) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Feed post not found');
  }
  if (!canViewPost(db, currentUser.id, post)) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot comment on this post');
  }

  const info = db
    .prepare(
      'INSERT INTO feed_comments (post_id, author_id, body) VALUES (?, ?, ?)'
    )
    .run(id, currentUser.id, body);

  const c = db
    .prepare(
      `SELECT fc.id, fc.post_id, fc.author_id, fc.body, fc.created_at,
              u.username, u.display_name, u.avatar_color
       FROM feed_comments fc
       JOIN users u ON u.id = fc.author_id
       WHERE fc.id = ?`
    )
    .get(info.lastInsertRowid);

  return {
    id: c.id,
    postId: c.post_id,
    authorId: c.author_id,
    body: c.body,
    createdAt: c.created_at,
    author: {
      id: c.author_id,
      username: c.username,
      displayName: c.display_name,
      avatarColor: c.avatar_color
    }
  };
}

export function deleteFeedPost(db, currentUser, postId) {
  const id = Number(postId);
  const post = db.prepare('SELECT * FROM feed_posts WHERE id = ?').get(id);
  if (!post) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Feed post not found');
  }
  if (post.author_id !== currentUser.id) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Only the post author can delete this post'
    );
  }

  db.prepare('DELETE FROM feed_posts WHERE id = ?').run(id);
  return { deleted: true };
}
