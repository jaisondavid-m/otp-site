const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.pcdp.bitsathy.in'

async function getJson(path, opts = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}

async function postJson(path, body, opts = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...opts,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}

async function deleteJson(path, opts = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
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
  return fetch(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(deviceId)}/password`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error || 'Request failed')
    }

    return data
  })
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

export function createShareToken(ttlMinutes = 30, customCode = '') {
  return postJson('/api/share/create', {
    ttl_minutes: ttlMinutes,
    custom_code: customCode,
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