const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.pcdp.bitsathy.in'

function getAuthHeaders(customHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...customHeaders }
  const token = localStorage.getItem('session_token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function getJson(path, opts = {}) {
  const { headers, ...restOpts } = opts
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders(headers),
    ...restOpts,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}

async function postJson(path, body, opts = {}) {
  const { headers, ...restOpts } = opts
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(headers),
    body: JSON.stringify(body),
    ...restOpts,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}

async function deleteJson(path, opts = {}) {
  const { headers, ...restOpts } = opts
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders(headers),
    ...restOpts,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function loginUser(payload) {
  return postJson('/auth/login', payload)
}

export function logoutUser() {
  return postJson('/auth/logout', {})
}

export function getCurrentUser() {
  return getJson('/auth/me')
}

export function listAdminUsers() {
  return getJson('/api/admin/users')
}

export function createAdminUser(payload) {
  return postJson('/api/admin/users', payload)
}

export function updateAdminUserPassword(deviceId, payload) {
  return postJson(`/api/admin/users/${encodeURIComponent(deviceId)}/password`, payload)
}

export function updateAdminUserName(deviceId, payload) {
  return postJson(`/api/admin/users/${encodeURIComponent(deviceId)}/name`, payload)
}

export function deleteAdminUser(deviceId) {
  return deleteJson(`/api/admin/users/${encodeURIComponent(deviceId)}`)
}

export function registerUser(payload) {
  return createAdminUser(payload)
}

// ─── OTP ──────────────────────────────────────────────────────────────────────

export function submitOTP(otp) {
  return postJson('/api/otp', { otp })
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export function getProfile() {
  return getJson('/api/profile')
}

export function getRewardsLeaderboard(filter = 'overall', id = '6') {
  const filterParam = filter && filter !== 'overall' ? `&filter=${encodeURIComponent(filter)}` : ''
  return getJson(`/api/points/leaderboard?id=${encodeURIComponent(id)}${filterParam}`)
}

export function getRewardsOpportunitiesHistory(id = '6') {
  return getJson(`/api/points/opportunities/history?id=${encodeURIComponent(id)}`)
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export function getAttendance(date) {
  return getJson(`/api/attendance?date=${encodeURIComponent(date)}`)
}

// ─── Pending Actions ──────────────────────────────────────────────────────────

export function getPendingActions(query = 'today=yes') {
  const suffix = query ? `?${query}` : ''
  return getJson(`/api/pending-action${suffix}`)
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export function getActivity(date) {
  return getJson(`/api/activity?date=${encodeURIComponent(date)}`)
}

export function getActivityDetails(id) {
  return getJson(`/api/activity/details?id=${encodeURIComponent(id)}`)
}

// ─── Share ────────────────────────────────────────────────────────────────────

export function getMyShareToken() {
  return getJson('/api/share')
}

export function createShareToken(ttlMinutes = 30, customCode = '', targetDeviceIds = [], includeSelf = true) {
  return postJson('/api/share/create', {
    ttl_minutes: ttlMinutes,
    custom_code: customCode,
    target_device_ids: targetDeviceIds,
    include_self: includeSelf,
  })
}

export function revokeShareToken() {
  return deleteJson('/api/share/revoke')
}

// ─── Friends ───────────────────────────────────────────────────────────────

export function sendFriendRequest(targetDeviceId) {
  return postJson('/api/friends/request', { target_device_id: targetDeviceId })
}

export function getFriendRequests() {
  return getJson('/api/friends/requests')
}

export function approveFriendRequest(id) {
  return postJson(`/api/friends/requests/${encodeURIComponent(id)}/approve`, {})
}

export function rejectFriendRequest(id) {
  return postJson(`/api/friends/requests/${encodeURIComponent(id)}/reject`, {})
}

export function listFriends() {
  return getJson('/api/friends')
}

export function removeFriend(deviceId) {
  return deleteJson(`/api/friends/${encodeURIComponent(deviceId)}`)
}

export function setFriendNickname(friendDeviceId, nickname) {
  return postJson('/api/friends/nickname', {
    friend_device_id: friendDeviceId,
    nickname,
  })
}

export function submitFriendsOTP(otp, targetDeviceIds = [], includeSelf = true) {
  return postJson('/api/friends/submit-otp', {
    otp,
    target_device_ids: targetDeviceIds,
    include_self: includeSelf,
  })
}

export function getNotifications() {
  return getJson('/api/notifications')
}

export function getSurveyQuestions(surveyId) {
  return getJson(`/api/activity/survey/questions?id=${encodeURIComponent(surveyId)}&limit=true`)
}

export function submitSurvey(payload) {
  return postJson('/api/activity/survey/submit', payload)
}

// Public — no session cookie needed, no credentials
export async function getShareTokenInfo(token) {
  const response = await fetch(`${API_BASE_URL}/share/${encodeURIComponent(token)}/info`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
  // 404 and 410 still return JSON with { valid: false } — don't throw
  return response.json().catch(() => ({ valid: false, error: 'Invalid response' }))
}

export async function submitShareOTP(token, otp) {
  const response = await fetch(`${API_BASE_URL}/share/${encodeURIComponent(token)}/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Failed to submit OTP')
  }

  return data
}

// ─── User Images ─────────────────────────────────────────────────────────────

export function getUserImageUrl(userId) {
  if (!userId) return ''
  const token = localStorage.getItem('session_token') || ''
  return `${API_BASE_URL}/api/user/images?userId=${encodeURIComponent(userId)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
}

export function formatImageUrl(url, fallbackUserId = '') {
  if (!url && !fallbackUserId) return ''
  const token = localStorage.getItem('session_token') || ''

  if (url && (url.includes('ps.bitsathy.ac.in') || url.includes('/user/images'))) {
    try {
      const parsed = new URL(url)
      const uId = parsed.searchParams.get('userId') || parsed.searchParams.get('user_id') || fallbackUserId
      if (uId) {
        return `${API_BASE_URL}/api/user/images?userId=${encodeURIComponent(uId)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
      }
    } catch {
      // relative url
    }
  }

  if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:'))) {
    return url
  }

  if (fallbackUserId) {
    return `${API_BASE_URL}/api/user/images?userId=${encodeURIComponent(fallbackUserId)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
  }

  return url || ''
}