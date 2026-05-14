const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

async function getJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}

async function postJson(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}

export function registerUser(payload) {
  return postJson('/auth/register', payload)
}

export function loginUser(payload) {
  return postJson('/auth/login', payload)
}

export function submitOTP(otp) {
  return postJson('/api/otp', { otp })
}

export function getAttendance(date) {
  return getJson(`/api/attendance?date=${encodeURIComponent(date)}`)
}

export function getPendingActions(query = 'today=yes') {
  const suffix = query ? `?${query}` : ''
  return getJson(`/api/pending-action${suffix}`)
}

export function logoutUser() {
  return postJson('/auth/logout', {})
}

export function getActivity(date) {
  return getJson(`/api/activity?date=${encodeURIComponent(date)}`)
}