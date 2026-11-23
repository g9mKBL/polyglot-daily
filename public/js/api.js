export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || 'Request failed');
    this.status = status;
    this.code = code || 'API_ERROR';
  }
}

const TOKEN_STORAGE_KEY = 'polyglot_auth_token';

export function getStoredToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

async function request(path, options = {}) {
  const { method = 'GET', body = undefined, headers = {} } = options;
  const reqHeaders = { ...headers };

  const token = getStoredToken();
  if (token && !reqHeaders.Authorization) {
    reqHeaders.Authorization = `Bearer ${token}`;
  }

  let serializedBody;
  if (body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
    serializedBody = JSON.stringify(body);
  }

  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: reqHeaders,
    body: serializedBody
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError(res.status, 'INVALID_RESPONSE', 'Invalid server response');
  }

  if (!res.ok || !payload?.ok) {
    const err = payload?.error || {};
    throw new ApiError(
      res.status,
      err.code || 'REQUEST_FAILED',
      err.message || `HTTP ${res.status}`
    );
  }

  return payload.data;
}

function buildQuery(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') {
      qs.set(k, String(v));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export const api = {
  getHealth: () => request('/api/health'),
  getDemoAccounts: () => request('/api/auth/demo-accounts'),
  register: async (payload) => {
    const data = await request('/api/auth/register', {
      method: 'POST',
      body: payload
    });
    if (data?.token) setStoredToken(data.token);
    return data;
  },
  login: async (payload) => {
    const data = await request('/api/auth/login', {
      method: 'POST',
      body: payload
    });
    if (data?.token) setStoredToken(data.token);
    return data;
  },
  logout: async () => {
    try {
      return await request('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },
  getMe: () => request('/api/auth/me'),
  updateProfile: (payload) =>
    request('/api/profile', { method: 'PATCH', body: payload }),

  getCourses: (language) =>
    request(`/api/courses${buildQuery({ language })}`),
  getLevel: (levelId) =>
    request(`/api/levels/${encodeURIComponent(levelId)}`),
  getLesson: (lessonId) =>
    request(`/api/lessons/${encodeURIComponent(lessonId)}`),

  completeLesson: (lessonId, payload) =>
    request(`/api/lessons/${encodeURIComponent(lessonId)}/complete`, {
      method: 'POST',
      body: payload
    }),
  getVocabReview: (params) =>
    request(`/api/vocab/review${buildQuery(params)}`),
  reviewVocab: (vocabId, rating) =>
    request(`/api/vocab/${encodeURIComponent(vocabId)}/review`, {
      method: 'POST',
      body: { rating }
    }),
  getMistakes: (language) =>
    request(`/api/mistakes${buildQuery({ language })}`),
  getProgressSummary: () => request('/api/progress/summary'),

  getFriends: () => request('/api/friends'),
  searchFriends: (q) => request(`/api/friends/search${buildQuery({ q })}`),
  sendFriendRequest: (payload) =>
    request('/api/friends/request', { method: 'POST', body: payload }),
  respondFriendRequest: (id, action) =>
    request(`/api/friends/requests/${encodeURIComponent(id)}/respond`, {
      method: 'POST',
      body: { action }
    }),
  removeFriend: (friendUserId) =>
    request(`/api/friends/${encodeURIComponent(friendUserId)}`, {
      method: 'DELETE'
    }),

  getGroups: () => request('/api/groups'),
  createGroup: (payload) =>
    request('/api/groups', { method: 'POST', body: payload }),
  joinGroup: (inviteCode) =>
    request('/api/groups/join', { method: 'POST', body: { inviteCode } }),
  getGroupDetail: (groupId) =>
    request(`/api/groups/${encodeURIComponent(groupId)}`),
  leaveGroup: (groupId) =>
    request(`/api/groups/${encodeURIComponent(groupId)}/leave`, {
      method: 'POST'
    }),

  getLeaderboard: (params) =>
    request(`/api/leaderboard${buildQuery(params)}`),
  getFeed: (params) => request(`/api/feed${buildQuery(params)}`),
  createFeedPost: (payload) =>
    request('/api/feed', { method: 'POST', body: payload }),
  toggleCheer: (postId, reaction = 'cheer') =>
    request(`/api/feed/${encodeURIComponent(postId)}/cheer`, {
      method: 'POST',
      body: { reaction }
    }),
  addComment: (postId, body) =>
    request(`/api/feed/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      body: { body }
    }),
  deleteFeedPost: (postId) =>
    request(`/api/feed/${encodeURIComponent(postId)}`, { method: 'DELETE' })
};
