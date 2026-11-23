import { api } from '../api.js';
import { escapeHtml, langShort } from '../ruby.js';
import { getState, notify } from '../state.js';

export async function renderSocialView(container, { initialTab = 'friends' }) {
  let activeTab = initialTab || 'friends';
  let friendsData = {
    friendCode: '',
    friends: [],
    incomingRequests: [],
    outgoingRequests: []
  };
  let searchResults = [];
  let searchQuery = '';

  let groups = [];
  let selectedGroupId = null;
  let groupDetail = null;

  let lbParams = { scope: 'global', groupId: '', timeframe: 'weekly', language: 'all' };
  let lbData = { entries: [] };

  let feedParams = { scope: 'all', groupId: '' };
  let feedPosts = [];

  async function refreshAll() {
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Đang tải cộng đồng học tập… / Loading social hub…</p></div>`;
    try {
      const [frRes, grRes] = await Promise.all([api.getFriends(), api.getGroups()]);
      friendsData = frRes;
      groups = grRes?.groups || [];
      if (!selectedGroupId && groups.length > 0) {
        selectedGroupId = groups[0].id;
      }
      if (selectedGroupId && !groups.some((g) => g.id === selectedGroupId)) {
        selectedGroupId = groups[0]?.id || null;
      }

      if (selectedGroupId) {
        groupDetail = await api.getGroupDetail(selectedGroupId).catch(() => null);
      } else {
        groupDetail = null;
      }

      await Promise.all([loadLeaderboard(), loadFeed()]);
      render();
    } catch (err) {
      container.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadLeaderboard() {
    const query = {
      scope: lbParams.scope,
      timeframe: lbParams.timeframe,
      language: lbParams.language
    };
    if (lbParams.scope === 'group') {
      const gid = Number(lbParams.groupId || selectedGroupId);
      if (!gid) {
        lbData = { entries: [] };
        return;
      }
      query.groupId = gid;
    }
    lbData = await api.getLeaderboard(query);
  }

  async function loadFeed() {
    const query = { scope: feedParams.scope, limit: 25 };
    if (feedParams.scope === 'group') {
      const gid = Number(feedParams.groupId || selectedGroupId);
      if (!gid) {
        feedPosts = [];
        return;
      }
      query.groupId = gid;
    }
    const res = await api.getFeed(query);
    feedPosts = res?.posts || [];
  }

  function render() {
    const me = getState().user;

    container.innerHTML = `
      <div class="stack" data-testid="social-view">
        <div class="page-header">
          <div>
            <h1>Bạn bè, Nhóm học &amp; Bảng xếp hạng / Social Hub</h1>
            <p class="muted" style="margin:4px 0 0">
              Cùng bạn bè đặt mục tiêu XP mỗi tuần, cổ vũ và chia sẻ tiến độ học tập.
            </p>
          </div>
          <div class="badge badge-primary">
            Mã kết bạn của bạn: <strong class="mono" data-testid="my-friend-code">${escapeHtml(friendsData.friendCode || me?.friendCode || '')}</strong>
          </div>
        </div>

        <div class="tabs" role="tablist">
          <button type="button" class="tab-btn ${activeTab === 'friends' ? 'is-active' : ''}" data-social-tab="friends" data-testid="social-tab-friends">
            Bạn bè / Friends (${friendsData.friends.length})
            ${friendsData.incomingRequests.length ? `<span class="nav-badge">${friendsData.incomingRequests.length}</span>` : ''}
          </button>
          <button type="button" class="tab-btn ${activeTab === 'groups' ? 'is-active' : ''}" data-social-tab="groups" data-testid="social-tab-groups">
            Nhóm học / Groups (${groups.length})
          </button>
          <button type="button" class="tab-btn ${activeTab === 'leaderboard' ? 'is-active' : ''}" data-social-tab="leaderboard" data-testid="social-tab-leaderboard">
            Bảng xếp hạng / Leaderboard
          </button>
          <button type="button" class="tab-btn ${activeTab === 'feed' ? 'is-active' : ''}" data-social-tab="feed" data-testid="social-tab-feed">
            Bảng tin / Progress Feed
          </button>
        </div>

        ${
          activeTab === 'friends'
            ? renderFriendsTab()
            : activeTab === 'groups'
              ? renderGroupsTab()
              : activeTab === 'leaderboard'
                ? renderLeaderboardTab()
                : renderFeedTab(me)
        }
      </div>
    `;

    bindEvents();
  }

  function renderFriendsTab() {
    return `
      <div class="stack" data-testid="friends-panel">
        <div class="grid-2">
          <div class="card stack-sm">
            <h2 class="section-title">Tìm bạn bè / Search Users</h2>
            <form id="friend-search-form" class="row" data-testid="friend-search-form">
              <input id="friend-search-input" class="input" style="flex:1" type="text" placeholder="Tên, @username hoặc mã LN-XXXX" value="${escapeHtml(searchQuery)}" data-testid="friend-search-input" />
              <button type="submit" class="btn btn-primary" data-testid="friend-search-btn">Tìm kiếm</button>
            </form>

            ${
              searchResults.length > 0
                ? `
              <div class="stack-sm" data-testid="friend-search-results">
                ${searchResults
                  .map(
                    (u) => `
                  <div class="card-subtle row-between">
                    <div class="row">
                      <span class="avatar" style="background:${escapeHtml(u.avatarColor || '#2563eb')}">${escapeHtml((u.displayName || u.username).slice(0, 1).toUpperCase())}</span>
                      <div>
                        <strong>${escapeHtml(u.displayName)}</strong> <span class="subtle">@${escapeHtml(u.username)}</span>
                        <div class="subtle">Mã: <span class="mono">${escapeHtml(u.friendCode)}</span> · ⚡${u.totalXp} XP · 🔥${u.currentStreak}</div>
                      </div>
                    </div>
                    ${
                      u.relationshipStatus === 'accepted'
                        ? '<span class="badge badge-success">Đã là bạn</span>'
                        : u.relationshipStatus === 'pending_out'
                          ? '<span class="badge">Đã gửi lời mời</span>'
                          : u.relationshipStatus === 'pending_in'
                            ? `<button type="button" class="btn btn-sm btn-primary" data-add-friend-id="${u.id}" data-testid="friend-add-user-${u.id}">Chấp nhận</button>`
                            : `<button type="button" class="btn btn-sm btn-primary" data-add-friend-id="${u.id}" data-testid="friend-add-user-${u.id}">+ Kết bạn</button>`
                    }
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
                : searchQuery
                  ? '<p class="subtle">Không tìm thấy người dùng phù hợp.</p>'
                  : ''
            }
          </div>

          <div class="card stack-sm">
            <h2 class="section-title">Thêm bạn bằng mã hoặc Username</h2>
            <form id="friend-code-form" class="row" data-testid="friend-code-form">
              <input id="friend-code-input" class="input" style="flex:1" type="text" required placeholder="Nhập mã LN-XXXX hoặc username" data-testid="friend-code-input" />
              <button type="submit" class="btn btn-primary" data-testid="friend-code-submit">Gửi lời mời</button>
            </form>
            <div class="row-between card-subtle">
              <span>Mã của bạn: <strong class="mono">${escapeHtml(friendsData.friendCode)}</strong></span>
              <button type="button" class="btn btn-sm" id="btn-copy-friend-code">Sao chép mã</button>
            </div>
          </div>
        </div>

        ${
          friendsData.incomingRequests.length > 0
            ? `
          <div class="card stack-sm" data-testid="incoming-friend-requests">
            <h2 class="section-title">Lời mời kết bạn đến (${friendsData.incomingRequests.length})</h2>
            <div class="grid-2">
              ${friendsData.incomingRequests
                .map(
                  (req) => `
                <div class="card-subtle row-between" data-testid="friend-request-${req.id}">
                  <div>
                    <strong>${escapeHtml(req.user.displayName)}</strong>
                    <div class="subtle">@${escapeHtml(req.user.username)} · ⚡${req.user.totalXp} XP</div>
                  </div>
                  <div class="row">
                    <button type="button" class="btn btn-sm btn-success" data-respond-req="${req.id}" data-respond-action="accept" data-testid="friend-accept-${req.id}">Chấp nhận</button>
                    <button type="button" class="btn btn-sm btn-danger" data-respond-req="${req.id}" data-respond-action="decline" data-testid="friend-decline-${req.id}">Từ chối</button>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        `
            : ''
        }

        <div class="card stack-sm">
          <h2 class="section-title">Danh sách bạn bè (${friendsData.friends.length})</h2>
          ${
            friendsData.friends.length === 0
              ? '<p class="subtle">Bạn chưa kết bạn với ai. Hãy tìm theo tên hoặc nhập mã LN-XXXX ở trên!</p>'
              : `
            <div class="grid-2" data-testid="friends-list">
              ${friendsData.friends
                .map(
                  (f) => `
                <div class="card-subtle row-between" data-testid="friend-card-${f.id}">
                  <div class="row">
                    <span class="avatar" style="background:${escapeHtml(f.avatarColor || '#2563eb')}">${escapeHtml((f.displayName || f.username).slice(0, 1).toUpperCase())}</span>
                    <div>
                      <strong>${escapeHtml(f.displayName)}</strong> <span class="badge badge-${escapeHtml(f.activeLanguage)}">${langShort(f.activeLanguage)}</span>
                      <div class="subtle">@${escapeHtml(f.username)} · ⚡${f.totalXp} XP · 🔥${f.currentStreak} ngày</div>
                    </div>
                  </div>
                  <button type="button" class="btn btn-sm btn-ghost" data-remove-friend="${f.id}">Hủy kết bạn</button>
                </div>
              `
                )
                .join('')}
            </div>
          `
          }
          ${
            friendsData.outgoingRequests.length > 0
              ? `<div class="subtle">Đang chờ phản hồi (${friendsData.outgoingRequests.length}): ${friendsData.outgoingRequests.map((r) => `@${escapeHtml(r.user.username)}`).join(', ')}</div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  function renderGroupsTab() {
    const activeGroup = groupDetail?.group || null;
    const dailyPct = activeGroup
      ? Math.min(100, Math.round((groupDetail.collectiveDailyXp / Math.max(1, activeGroup.dailyGroupXpGoal)) * 100))
      : 0;
    const weeklyPct = activeGroup
      ? Math.min(100, Math.round((groupDetail.collectiveWeeklyXp / Math.max(1, activeGroup.weeklyGroupXpGoal)) * 100))
      : 0;

    return `
      <div class="stack" data-testid="groups-panel">
        <div class="grid-2">
          <div class="card stack-sm">
            <h2 class="section-title">Tạo nhóm học mới / Create Study Group</h2>
            <form id="create-group-form" class="stack-sm" data-testid="create-group-form">
              <div class="field">
                <label for="grp-name">Tên nhóm / Group Name *</label>
                <input id="grp-name" name="name" class="input" type="text" required minlength="2" maxlength="60" placeholder="vd: Team N5 & HSK2" data-testid="create-group-name" />
              </div>
              <div class="field">
                <label for="grp-desc">Mô tả ngắn / Description</label>
                <input id="grp-desc" name="description" class="input" type="text" placeholder="Học mỗi ngày 15 phút" data-testid="create-group-desc" />
              </div>
              <div class="grid-3">
                <div class="field">
                  <label for="grp-lang">Ngôn ngữ</label>
                  <select id="grp-lang" name="focusLanguage" class="select" data-testid="create-group-lang">
                    <option value="all">Tất cả (All)</option>
                    <option value="en">EN</option>
                    <option value="zh">ZH</option>
                    <option value="ja">JA</option>
                  </select>
                </div>
                <div class="field">
                  <label for="grp-daily">Mục tiêu ngày XP</label>
                  <input id="grp-daily" name="dailyGroupXpGoal" class="input" type="number" min="20" max="10000" value="200" data-testid="create-group-daily-goal" />
                </div>
                <div class="field">
                  <label for="grp-weekly">Mục tiêu tuần XP</label>
                  <input id="grp-weekly" name="weeklyGroupXpGoal" class="input" type="number" min="50" max="50000" value="1000" data-testid="create-group-weekly-goal" />
                </div>
              </div>
              <button type="submit" class="btn btn-primary" data-testid="create-group-submit">Tạo nhóm / Create Group</button>
            </form>
          </div>

          <div class="card stack-sm">
            <h2 class="section-title">Tham gia nhóm bằng mã mời / Join Group</h2>
            <form id="join-group-form" class="row" data-testid="join-group-form">
              <input id="join-group-code-input" class="input" style="flex:1" type="text" required placeholder="Nhập mã mời (vd: GRP-CLUB)" data-testid="join-group-code-input" />
              <button type="submit" class="btn btn-primary" data-testid="join-group-submit">Tham gia</button>
            </form>

            <h3 style="margin:10px 0 4px;font-size:1rem">Nhóm của bạn (${groups.length})</h3>
            ${
              groups.length === 0
                ? '<p class="subtle">Bạn chưa tham gia nhóm học nào.</p>'
                : `
              <div class="stack-sm" data-testid="groups-list">
                ${groups
                  .map(
                    (g) => `
                  <button type="button" class="demo-card" style="justify-content:space-between;${selectedGroupId === g.id ? 'border-color:var(--primary);background:var(--primary-soft)' : ''}" data-select-group="${g.id}" data-testid="group-card-${g.id}">
                    <span>
                      <strong>${escapeHtml(g.name)}</strong>
                      <div class="subtle">Mã: <span class="mono">${escapeHtml(g.inviteCode)}</span> · ${g.memberCount} thành viên</div>
                    </span>
                    <span class="badge badge-${escapeHtml(g.focusLanguage)}">${langShort(g.focusLanguage)}</span>
                  </button>
                `
                  )
                  .join('')}
              </div>
            `
            }
          </div>
        </div>

        ${
          activeGroup
            ? `
          <div class="card stack" data-testid="group-detail">
            <div class="row-between">
              <div>
                <div class="row">
                  <span class="badge badge-primary">Mã mời: <strong class="mono">${escapeHtml(activeGroup.inviteCode)}</strong></span>
                  <span class="badge badge-${escapeHtml(activeGroup.focusLanguage)}">${langShort(activeGroup.focusLanguage)}</span>
                </div>
                <h2 style="margin:6px 0 2px">${escapeHtml(activeGroup.name)}</h2>
                <p class="subtle" style="margin:0">${escapeHtml(activeGroup.description || '')}</p>
              </div>
              <button type="button" class="btn btn-danger btn-sm" id="btn-leave-group" data-testid="leave-group-btn">
                Rời nhóm / Leave Group
              </button>
            </div>

            <div class="grid-2">
              <div class="card-subtle stack-sm">
                <div class="row-between">
                  <strong>Mục tiêu XP ngày của nhóm</strong>
                  <span>${groupDetail.collectiveDailyXp} / ${activeGroup.dailyGroupXpGoal} XP (${dailyPct}%)</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill ${dailyPct >= 100 ? 'is-success' : ''}" style="width:${dailyPct}%"></div>
                </div>
              </div>
              <div class="card-subtle stack-sm">
                <div class="row-between">
                  <strong>Mục tiêu XP tuần của nhóm</strong>
                  <span>${groupDetail.collectiveWeeklyXp} / ${activeGroup.weeklyGroupXpGoal} XP (${weeklyPct}%)</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill ${weeklyPct >= 100 ? 'is-success' : ''}" style="width:${weeklyPct}%"></div>
                </div>
              </div>
            </div>

            <div>
              <h3 style="margin:0 0 8px;font-size:1rem">Đóng góp thành viên / Member Contributions</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Thành viên</th>
                      <th>Vai trò</th>
                      <th>Hôm nay</th>
                      <th>Tuần này</th>
                      <th>Tổng XP</th>
                      <th>Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(groupDetail.members || [])
                      .map(
                        (m) => `
                      <tr>
                        <td><strong>${escapeHtml(m.displayName)}</strong> <span class="subtle">@${escapeHtml(m.username)}</span></td>
                        <td><span class="badge">${escapeHtml(m.role)}</span></td>
                        <td>${m.dailyXp} XP</td>
                        <td><strong>${m.weeklyXp} XP</strong></td>
                        <td>${m.totalXp} XP</td>
                        <td>🔥 ${m.currentStreak}</td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 style="margin:0 0 8px;font-size:1rem">Hoạt động trong nhóm / Group Feed</h3>
              ${
                (groupDetail.feed || []).length === 0
                  ? '<p class="subtle">Chưa có bài đăng nào trong nhóm.</p>'
                  : `
                <div class="stack-sm">
                  ${groupDetail.feed
                    .slice(0, 5)
                    .map(
                      (p) => `
                    <div class="card-subtle">
                      <strong>${escapeHtml(p.author?.displayName || '')}:</strong> ${escapeHtml(p.title)}
                      ${p.body ? `<div class="subtle">${escapeHtml(p.body)}</div>` : ''}
                    </div>
                  `
                    )
                    .join('')}
                </div>
              `
              }
            </div>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  function renderLeaderboardTab() {
    const entries = lbData?.entries || [];
    return `
      <div class="card stack" data-testid="leaderboard-panel">
        <div class="row-between">
          <h2 class="section-title" style="margin:0">Bảng xếp hạng / Leaderboard</h2>
          <div class="row">
            <select id="lb-scope" class="select" style="width:auto" data-testid="lb-scope-select">
              <option value="global" ${lbParams.scope === 'global' ? 'selected' : ''}>Toàn hệ thống / Global</option>
              <option value="friends" ${lbParams.scope === 'friends' ? 'selected' : ''}>Bạn bè / Friends</option>
              <option value="group" ${lbParams.scope === 'group' ? 'selected' : ''} ${groups.length === 0 ? 'disabled' : ''}>Theo nhóm / Group</option>
            </select>
            ${
              lbParams.scope === 'group' && groups.length > 0
                ? `
              <select id="lb-group" class="select" style="width:auto" data-testid="lb-group-select">
                ${groups
                  .map(
                    (g) =>
                      `<option value="${g.id}" ${Number(lbParams.groupId || selectedGroupId) === g.id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`
                  )
                  .join('')}
              </select>
            `
                : ''
            }
            <select id="lb-timeframe" class="select" style="width:auto" data-testid="lb-timeframe-select">
              <option value="daily" ${lbParams.timeframe === 'daily' ? 'selected' : ''}>Hôm nay / Daily</option>
              <option value="weekly" ${lbParams.timeframe === 'weekly' ? 'selected' : ''}>7 ngày / Weekly</option>
              <option value="all_time" ${lbParams.timeframe === 'all_time' ? 'selected' : ''}>Mọi thời gian / All Time</option>
            </select>
            <select id="lb-language" class="select" style="width:auto" data-testid="lb-language-select">
              <option value="all" ${lbParams.language === 'all' ? 'selected' : ''}>Tất cả (All)</option>
              <option value="en" ${lbParams.language === 'en' ? 'selected' : ''}>EN</option>
              <option value="zh" ${lbParams.language === 'zh' ? 'selected' : ''}>ZH</option>
              <option value="ja" ${lbParams.language === 'ja' ? 'selected' : ''}>JA</option>
            </select>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table" data-testid="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Học viên</th>
                <th>Ngôn ngữ</th>
                <th>XP</th>
                <th>Streak</th>
                <th>Bài đã học</th>
              </tr>
            </thead>
            <tbody>
              ${
                entries.length === 0
                  ? '<tr><td colspan="6" class="subtle">Chưa có dữ liệu xếp hạng.</td></tr>'
                  : entries
                      .map(
                        (e) => `
                  <tr class="${e.isCurrentUser ? 'is-me' : ''}" data-testid="lb-row-${escapeHtml(e.username)}">
                    <td><strong>#${e.rank}</strong></td>
                    <td>
                      <div class="row">
                        <span class="avatar" style="background:${escapeHtml(e.avatarColor || '#2563eb')}">${escapeHtml((e.displayName || e.username).slice(0, 1).toUpperCase())}</span>
                        <span>
                          ${escapeHtml(e.displayName)} ${e.isCurrentUser ? '<span class="badge badge-primary">Bạn</span>' : ''}
                          <div class="subtle">@${escapeHtml(e.username)}</div>
                        </span>
                      </div>
                    </td>
                    <td><span class="badge badge-${escapeHtml(e.activeLanguage)}">${langShort(e.activeLanguage)}</span></td>
                    <td><strong>⚡ ${e.xp}</strong></td>
                    <td>🔥 ${e.currentStreak}</td>
                    <td>${e.lessonsCompleted}</td>
                  </tr>
                `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderFeedTab(me) {
    return `
      <div class="stack" data-testid="feed-panel">
        <div class="card stack-sm">
          <h2 class="section-title">Chia sẻ ghi chú học tập / Post Study Note</h2>
          <form id="feed-post-form" class="stack-sm" data-testid="feed-post-form">
            <div class="grid-3">
              <div class="field" style="grid-column: span 2">
                <label for="feed-title">Tiêu đề / Title *</label>
                <input id="feed-title" name="title" class="input" type="text" required maxlength="140" placeholder="vd: Mẹo nhớ Kanji N5 hôm nay" data-testid="feed-title-input" />
              </div>
              <div class="field">
                <label for="feed-visibility">Phạm vi / Visibility</label>
                <select id="feed-visibility" name="visibility" class="select" data-testid="feed-visibility-select">
                  <option value="friends">Bạn bè / Friends</option>
                  <option value="public">Công khai / Public</option>
                  ${
                    groups.length > 0
                      ? groups
                          .map(
                            (g) => `<option value="group:${g.id}">Nhóm: ${escapeHtml(g.name)}</option>`
                          )
                          .join('')
                      : ''
                  }
                </select>
              </div>
            </div>
            <div class="grid-3">
              <div class="field" style="grid-column: span 2">
                <label for="feed-body">Nội dung / Study Note</label>
                <textarea id="feed-body" name="body" class="textarea" rows="2" maxlength="1000" placeholder="Chia sẻ ghi chú, câu ví dụ hoặc cột mốc của bạn…" data-testid="feed-body-input"></textarea>
              </div>
              <div class="field">
                <label for="feed-lang">Ngôn ngữ</label>
                <select id="feed-lang" name="language" class="select">
                  <option value="">Chung / General</option>
                  <option value="en">EN</option>
                  <option value="zh">ZH</option>
                  <option value="ja">JA</option>
                </select>
              </div>
            </div>
            <div>
              <button type="submit" class="btn btn-primary" data-testid="feed-post-submit">Đăng lên bảng tin / Post</button>
            </div>
          </form>
        </div>

        <div class="card stack-sm">
          <div class="row-between">
            <h2 class="section-title" style="margin:0">Bảng tin tiến độ / Progress Feed</h2>
            <div class="row">
              <select id="feed-scope" class="select" style="width:auto" data-testid="feed-scope-select">
                <option value="all" ${feedParams.scope === 'all' ? 'selected' : ''}>Tất cả / All</option>
                <option value="friends" ${feedParams.scope === 'friends' ? 'selected' : ''}>Bạn bè / Friends</option>
                <option value="group" ${feedParams.scope === 'group' ? 'selected' : ''} ${groups.length === 0 ? 'disabled' : ''}>Nhóm / Group</option>
              </select>
              ${
                feedParams.scope === 'group' && groups.length > 0
                  ? `
                <select id="feed-group" class="select" style="width:auto">
                  ${groups
                    .map(
                      (g) =>
                        `<option value="${g.id}" ${Number(feedParams.groupId || selectedGroupId) === g.id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`
                    )
                    .join('')}
                </select>
              `
                  : ''
              }
            </div>
          </div>

          ${
            feedPosts.length === 0
              ? '<p class="subtle">Chưa có bài đăng nào trong bảng tin.</p>'
              : `
            <div class="stack" data-testid="feed-posts-list">
              ${feedPosts
                .map(
                  (p) => `
                <article class="card-subtle feed-post" data-testid="feed-post-${p.id}">
                  <div class="row-between">
                    <div class="row">
                      <span class="avatar" style="background:${escapeHtml(p.author?.avatarColor || '#2563eb')}">${escapeHtml((p.author?.displayName || p.author?.username || '?').slice(0, 1).toUpperCase())}</span>
                      <div>
                        <strong>${escapeHtml(p.author?.displayName || '')}</strong>
                        <span class="subtle">@${escapeHtml(p.author?.username || '')}</span>
                        <div class="subtle">${escapeHtml(p.createdAt || '')}</div>
                      </div>
                    </div>
                    <div class="row">
                      ${p.language ? `<span class="badge badge-${escapeHtml(p.language)}">${langShort(p.language)}</span>` : ''}
                      <span class="badge">${p.groupName ? `Nhóm: ${escapeHtml(p.groupName)}` : escapeHtml(p.visibility)}</span>
                      ${
                        p.authorId === me?.id
                          ? `<button type="button" class="btn btn-sm btn-danger" data-delete-post="${p.id}" data-testid="feed-delete-${p.id}">Xóa</button>`
                          : ''
                      }
                    </div>
                  </div>

                  <div>
                    <strong style="font-size:1.05rem">${escapeHtml(p.title)}</strong>
                    ${p.body ? `<p style="margin:4px 0 0">${escapeHtml(p.body)}</p>` : ''}
                  </div>

                  <div class="row">
                    <button type="button"
                      class="btn btn-sm ${p.cheeredByMe ? 'btn-primary' : ''}"
                      data-cheer-post="${p.id}"
                      data-testid="feed-cheer-${p.id}">
                      👏 Cổ vũ (${p.cheerCount || 0})
                    </button>
                  </div>

                  ${
                    (p.comments || []).length > 0
                      ? `
                    <div class="comments-list">
                      ${p.comments
                        .map(
                          (c) => `
                        <div class="subtle">
                          <strong>${escapeHtml(c.author?.displayName || '')}:</strong> ${escapeHtml(c.body)}
                        </div>
                      `
                        )
                        .join('')}
                    </div>
                  `
                      : ''
                  }

                  <form class="row" data-comment-form="${p.id}">
                    <input class="input" style="flex:1" type="text" required maxlength="500" placeholder="Viết bình luận động viên…" data-testid="feed-comment-input-${p.id}" />
                    <button type="submit" class="btn btn-sm" data-testid="feed-comment-submit-${p.id}">Gửi</button>
                  </form>
                </article>
              `
                )
                .join('')}
            </div>
          `
          }
        </div>
      </div>
    `;
  }

  function bindEvents() {
    container.querySelectorAll('[data-social-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-social-tab');
        render();
      });
    });

    // Friends
    container.querySelector('#friend-search-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      searchQuery = container.querySelector('#friend-search-input')?.value.trim() || '';
      if (!searchQuery) {
        searchResults = [];
        render();
        return;
      }
      try {
        const res = await api.searchFriends(searchQuery);
        searchResults = res?.results || [];
        render();
      } catch (err) {
        notify(err.message, 'error');
      }
    });

    container.querySelectorAll('[data-add-friend-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const targetUserId = Number(btn.getAttribute('data-add-friend-id'));
        try {
          const res = await api.sendFriendRequest({ targetUserId });
          notify(res.autoAccepted ? 'Đã kết bạn!' : 'Đã gửi lời mời kết bạn!', 'success');
          if (searchQuery) {
            const sr = await api.searchFriends(searchQuery);
            searchResults = sr?.results || [];
          }
          friendsData = await api.getFriends();
          await Promise.all([loadFeed(), loadLeaderboard()]);
          render();
        } catch (err) {
          notify(err.message, 'error');
        }
      });
    });

    container.querySelector('#friend-code-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = container.querySelector('#friend-code-input')?.value.trim();
      if (!val) return;
      const payload = val.toUpperCase().startsWith('LN-')
        ? { friendCode: val }
        : { username: val };
      try {
        const res = await api.sendFriendRequest(payload);
        notify(res.autoAccepted ? 'Đã kết bạn!' : 'Đã gửi lời mời kết bạn!', 'success');
        friendsData = await api.getFriends();
        render();
      } catch (err) {
        notify(err.message, 'error');
      }
    });

    container.querySelector('#btn-copy-friend-code')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(friendsData.friendCode);
        notify(`Đã sao chép mã ${friendsData.friendCode}`, 'success');
      } catch {
        notify(`Mã của bạn: ${friendsData.friendCode}`, 'info');
      }
    });

    container.querySelectorAll('[data-respond-req]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-respond-req');
        const action = btn.getAttribute('data-respond-action');
        try {
          await api.respondFriendRequest(id, action);
          notify(action === 'accept' ? 'Đã chấp nhận kết bạn!' : 'Đã từ chối lời mời', 'success');
          friendsData = await api.getFriends();
          await Promise.all([loadFeed(), loadLeaderboard()]);
          render();
        } catch (err) {
          notify(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-remove-friend]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const fid = btn.getAttribute('data-remove-friend');
        try {
          await api.removeFriend(fid);
          notify('Đã xóa khỏi danh sách bạn bè', 'info');
          friendsData = await api.getFriends();
          await Promise.all([loadFeed(), loadLeaderboard()]);
          render();
        } catch (err) {
          notify(err.message, 'error');
        }
      });
    });

    // Groups
    container.querySelector('#create-group-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      try {
        const res = await api.createGroup({
          name: form.name.value.trim(),
          description: form.description.value.trim(),
          focusLanguage: form.focusLanguage.value,
          dailyGroupXpGoal: Number(form.dailyGroupXpGoal.value) || 200,
          weeklyGroupXpGoal: Number(form.weeklyGroupXpGoal.value) || 1000
        });
        selectedGroupId = res.group.id;
        notify(`Đã tạo nhóm "${res.group.name}" (Mã mời: ${res.group.inviteCode})`, 'success');
        await refreshAll();
      } catch (err) {
        notify(err.message, 'error');
      }
    });

    container.querySelector('#join-group-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = container.querySelector('#join-group-code-input')?.value.trim();
      if (!code) return;
      try {
        const res = await api.joinGroup(code);
        selectedGroupId = res.group.id;
        notify(
          res.alreadyMember
            ? `Bạn đã ở trong nhóm "${res.group.name}"`
            : `Đã tham gia nhóm "${res.group.name}"!`,
          'success'
        );
        await refreshAll();
      } catch (err) {
        notify(err.message, 'error');
      }
    });

    container.querySelectorAll('[data-select-group]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        selectedGroupId = Number(btn.getAttribute('data-select-group'));
        groupDetail = await api.getGroupDetail(selectedGroupId).catch(() => null);
        render();
      });
    });

    container.querySelector('#btn-leave-group')?.addEventListener('click', async () => {
      if (!selectedGroupId) return;
      try {
        await api.leaveGroup(selectedGroupId);
        notify('Đã rời khỏi nhóm học', 'info');
        selectedGroupId = null;
        await refreshAll();
      } catch (err) {
        notify(err.message, 'error');
      }
    });

    // Leaderboard
    container.querySelector('#lb-scope')?.addEventListener('change', async (e) => {
      lbParams.scope = e.target.value;
      if (lbParams.scope === 'group' && !lbParams.groupId && selectedGroupId) {
        lbParams.groupId = String(selectedGroupId);
      }
      await loadLeaderboard();
      render();
    });
    container.querySelector('#lb-group')?.addEventListener('change', async (e) => {
      lbParams.groupId = e.target.value;
      await loadLeaderboard();
      render();
    });
    container.querySelector('#lb-timeframe')?.addEventListener('change', async (e) => {
      lbParams.timeframe = e.target.value;
      await loadLeaderboard();
      render();
    });
    container.querySelector('#lb-language')?.addEventListener('change', async (e) => {
      lbParams.language = e.target.value;
      await loadLeaderboard();
      render();
    });

    // Feed
    container.querySelector('#feed-scope')?.addEventListener('change', async (e) => {
      feedParams.scope = e.target.value;
      if (feedParams.scope === 'group' && !feedParams.groupId && selectedGroupId) {
        feedParams.groupId = String(selectedGroupId);
      }
      await loadFeed();
      render();
    });
    container.querySelector('#feed-group')?.addEventListener('change', async (e) => {
      feedParams.groupId = e.target.value;
      await loadFeed();
      render();
    });

    container.querySelector('#feed-post-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const visVal = form.visibility.value;
      let visibility = visVal;
      let groupId = null;
      if (visVal.startsWith('group:')) {
        visibility = 'group';
        groupId = Number(visVal.split(':')[1]);
      }
      try {
        const res = await api.createFeedPost({
          postType: 'study_note',
          visibility,
          groupId,
          language: form.language.value || null,
          title: form.title.value.trim(),
          body: form.body.value.trim()
        });
        feedPosts = [res.post, ...feedPosts];
        notify('Đã đăng bài viết!', 'success');
        render();
      } catch (err) {
        notify(err.message, 'error');
      }
    });

    container.querySelectorAll('[data-cheer-post]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const postId = Number(btn.getAttribute('data-cheer-post'));
        try {
          const res = await api.toggleCheer(postId, 'cheer');
          const target = feedPosts.find((p) => p.id === postId);
          if (target) {
            target.cheeredByMe = res.cheered;
            target.cheerCount = res.cheerCount;
          }
          render();
        } catch (err) {
          notify(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-comment-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const postId = Number(form.getAttribute('data-comment-form'));
        const input = form.querySelector('input');
        const body = input?.value.trim();
        if (!body) return;
        try {
          const res = await api.addComment(postId, body);
          const target = feedPosts.find((p) => p.id === postId);
          if (target) {
            target.comments = [...(target.comments || []), res.comment];
          }
          render();
        } catch (err) {
          notify(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-delete-post]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const postId = Number(btn.getAttribute('data-delete-post'));
        try {
          await api.deleteFeedPost(postId);
          feedPosts = feedPosts.filter((p) => p.id !== postId);
          notify('Đã xóa bài đăng', 'info');
          render();
        } catch (err) {
          notify(err.message, 'error');
        }
      });
    });
  }

  await refreshAll();
}
