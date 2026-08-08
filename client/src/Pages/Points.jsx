import { useEffect, useState, useMemo } from 'react'
import { getRewardsLeaderboard, getRewardsOpportunitiesHistory } from '../api/auth.js'

function LeaderboardSection({ rewardId, rewardTitle }) {
  const [filter, setFilter] = useState('overall')
  const [leaderboardData, setLeaderboardData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // View History Modal State
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyData, setHistoryData] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState('')

  // Fetch Leaderboard Data
  const fetchLeaderboard = async (selectedFilter) => {
    setLoading(true)
    setError('')
    try {
      const res = await getRewardsLeaderboard(selectedFilter, rewardId)
      if (res && Array.isArray(res.data)) {
        setLeaderboardData(res.data)
      } else if (res && Array.isArray(res)) {
        setLeaderboardData(res)
      } else {
        setLeaderboardData([])
      }
    } catch (err) {
      setError(err.message || 'Failed to load leaderboard data')
      setLeaderboardData([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch History Data
  const handleOpenHistory = async () => {
    setShowHistoryModal(true)
    setLoadingHistory(true)
    setHistoryError('')
    try {
      const res = await getRewardsOpportunitiesHistory(rewardId)
      if (res && Array.isArray(res.data)) {
        setHistoryData(res.data)
      } else if (res && Array.isArray(res)) {
        setHistoryData(res)
      } else {
        setHistoryData([])
      }
    } catch (err) {
      setHistoryError(err.message || 'Failed to load points history')
      setHistoryData([])
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    fetchLeaderboard(filter)
  }, [filter, rewardId])

  // Attach original rank index (1-based) to each student entry
  const leaderboardWithRank = useMemo(() => {
    return leaderboardData.map((item, idx) => ({
      ...item,
      originalRank: idx + 1
    }))
  }, [leaderboardData])

  // Filtered Leaderboard based on Search Query
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return leaderboardWithRank
    const q = searchQuery.toLowerCase().trim()
    return leaderboardWithRank.filter((item) => {
      const nameMatch = item.name && item.name.toLowerCase().includes(q)
      const deptMatch = item.department && item.department.toLowerCase().includes(q)
      const rollMatch = item.rollNo && item.rollNo.toLowerCase().includes(q)
      const yearMatch = item.year && item.year.toLowerCase().includes(q)
      return nameMatch || deptMatch || rollMatch || yearMatch
    })
  }, [leaderboardWithRank, searchQuery])

  // Top 3 for Podium
  const topThree = useMemo(() => {
    if (leaderboardData.length < 3) return []
    return [
      leaderboardData[1], // 2nd place (left)
      leaderboardData[0], // 1st place (center)
      leaderboardData[2], // 3rd place (right)
    ]
  }, [leaderboardData])

  // Stats calculation
  const stats = useMemo(() => {
    if (leaderboardData.length === 0) return { total: 0, highest: 0, avg: 0 }
    const total = leaderboardData.length
    const highest = leaderboardData[0]?.points || 0
    const sum = leaderboardData.reduce((acc, curr) => acc + (curr.points || 0), 0)
    const avg = Math.round(sum / total)
    return { total, highest, avg }
  }, [leaderboardData])

  return (
    <div>
      {/* Sub-filter Pills & History Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setFilter('overall')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full, 20px)',
              border: `1.5px solid ${filter === 'overall' ? 'var(--accent)' : 'var(--border)'}`,
              background: filter === 'overall' ? 'var(--accent-dim)' : 'transparent',
              color: filter === 'overall' ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Overall
          </button>

          <button
            type="button"
            onClick={() => setFilter('department')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full, 20px)',
              border: `1.5px solid ${filter === 'department' ? 'var(--accent)' : 'var(--border)'}`,
              background: filter === 'department' ? 'var(--accent-dim)' : 'transparent',
              color: filter === 'department' ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Department
          </button>

          <button
            type="button"
            onClick={() => setFilter('year')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full, 20px)',
              border: `1.5px solid ${filter === 'year' ? 'var(--accent)' : 'var(--border)'}`,
              background: filter === 'year' ? 'var(--accent-dim)' : 'transparent',
              color: filter === 'year' ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Year
          </button>

          {/* View History Button */}
          <button
            type="button"
            onClick={handleOpenHistory}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full, 20px)',
              border: '1.5px solid var(--accent)',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            📜 View History
          </button>
        </div>
      </div>

      {/* Stats Summary Row */}
      {/* <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 12,
          marginBottom: 24
        }}
      >
        <div style={{ background: 'var(--bg-input)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL STUDENTS</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>{stats.total}</div>
        </div>

        <div style={{ background: 'var(--bg-input)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>HIGHEST POINTS</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', marginTop: 2 }}>{stats.highest}</div>
        </div>

        <div style={{ background: 'var(--bg-input)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>AVERAGE POINTS</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>{stats.avg}</div>
        </div>
      </div> */}

      {/* Loading State */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 0' }}>
          <div className="spinner" />
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading {rewardTitle} leaderboard...</span>
        </div>
      ) : error ? (
        <div className="activity-message error" style={{ margin: '20px 0' }}>
          <span>✕ {error}</span>
          <button
            type="button"
            onClick={() => fetchLeaderboard(filter)}
            style={{ marginLeft: 12, background: 'none', border: 'underline', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}
          >
            Retry
          </button>
        </div>
      ) : filteredList.length === 0 && searchQuery ? (
        <div>
          {/* Dedicated Search Input Bar directly above RANK & STUDENT NAME table header */}
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                placeholder="Search student by name, roll no, department, or year..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 38px',
                  fontSize: 13,
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--border-accent)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  transition: 'var(--transition)'
                }}
              />
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, opacity: 0.6 }}>
                🔍
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                padding: '9px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-input)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          </div>
          <div className="admin-empty-state">No students found matching "{searchQuery}".</div>
        </div>
      ) : leaderboardData.length === 0 ? (
        <div className="admin-empty-state">No students found for this view.</div>
      ) : (
        <>
          {/* Top 3 Podium Card */}
          {!searchQuery && topThree.length === 3 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                alignItems: 'end',
                marginBottom: 24,
                padding: '16px 12px',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)'
              }}
            >
              {/* 2nd Place */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1.5px solid #94a3b8',
                  borderRadius: 'var(--radius-md)',
                  padding: 14,
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span style={{ fontSize: 24 }}>🥈</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>RANK 2</span>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.3 }}>
                  {topThree[0].name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{topThree[0].department}</div>
                <div style={{ marginTop: 4, background: 'rgba(148, 163, 184, 0.15)', color: '#64748b', fontWeight: 800, padding: '4px 10px', borderRadius: 12, fontSize: 13 }}>
                  {topThree[0].points} pts
                </div>
              </div>

              {/* 1st Place */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '2px solid #eab308',
                  borderRadius: 'var(--radius-md)',
                  padding: '18px 14px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  transform: 'translateY(-8px)',
                  boxShadow: '0 4px 20px rgba(234, 179, 8, 0.15)'
                }}
              >
                <span style={{ fontSize: 32 }}>🥇</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#eab308', letterSpacing: '0.05em' }}>RANK 1</span>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.3 }}>
                  {topThree[1].name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{topThree[1].department}</div>
                <div style={{ marginTop: 4, background: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04', fontWeight: 800, padding: '4px 12px', borderRadius: 12, fontSize: 14 }}>
                  {topThree[1].points} pts
                </div>
              </div>

              {/* 3rd Place */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1.5px solid #cd7f32',
                  borderRadius: 'var(--radius-md)',
                  padding: 14,
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span style={{ fontSize: 24 }}>🥉</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#cd7f32', letterSpacing: '0.05em' }}>RANK 3</span>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.3 }}>
                  {topThree[2].name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{topThree[2].department}</div>
                <div style={{ marginTop: 4, background: 'rgba(205, 127, 50, 0.15)', color: '#b45309', fontWeight: 800, padding: '4px 10px', borderRadius: 12, fontSize: 13 }}>
                  {topThree[2].points} pts
                </div>
              </div>
            </div>
          )}

          {/* Dedicated Search Input Bar directly above RANK & STUDENT NAME table header */}
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                placeholder="Search student by name, roll no, department, or year..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 38px',
                  fontSize: 13,
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--border-accent)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  transition: 'var(--transition)'
                }}
              />
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, opacity: 0.6 }}>
                🔍
              </span>
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  padding: '9px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Leaderboard Table */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1.5fr 1fr 70px 100px 90px',
                background: 'var(--bg-input)',
                padding: '10px 16px',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-muted)',
                letterSpacing: '0.05em',
                borderBottom: '1px solid var(--border)'
              }}
            >
              <span>RANK</span>
              <span>STUDENT NAME</span>
              <span>DEPARTMENT</span>
              <span>YEAR</span>
              <span>ROLL NO</span>
              <span style={{ textAlign: 'right' }}>POINTS</span>
            </div>

            {filteredList.map((item, index) => {
              const rank = item.originalRank || (index + 1)
              const isTop1 = rank === 1
              const isTop2 = rank === 2
              const isTop3 = rank === 3

              let rankBadge = `#${rank}`
              if (isTop1) rankBadge = '🥇 #1'
              if (isTop2) rankBadge = '🥈 #2'
              if (isTop3) rankBadge = '🥉 #3'

              return (
                <div
                  key={item.rollNo || index}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1.5fr 1fr 70px 100px 90px',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderBottom: index < filteredList.length - 1 ? '1px solid var(--border)' : 'none',
                    background: isTop1
                      ? 'rgba(234, 179, 8, 0.05)'
                      : isTop2
                      ? 'rgba(148, 163, 184, 0.05)'
                      : isTop3
                      ? 'rgba(205, 127, 50, 0.05)'
                      : 'transparent',
                    transition: 'var(--transition)'
                  }}
                >
                  <span style={{
                    fontWeight: 800,
                    fontSize: 12,
                    color: isTop1 ? '#ca8a04' : isTop2 ? '#64748b' : isTop3 ? '#b45309' : 'var(--text-muted)'
                  }}>
                    {rankBadge}
                  </span>

                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                      {item.name}
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {item.department}
                  </div>

                  <div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: 'var(--bg-input)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)'
                    }}>
                      Year {item.year}
                    </span>
                  </div>

                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {item.rollNo}
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontWeight: 800,
                      fontSize: 14,
                      color: 'var(--accent)',
                      background: 'var(--accent-dim)',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)'
                    }}>
                      {item.points} pts
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* VIEW HISTORY MODAL */}
      {showHistoryModal && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="modal-box" style={{ width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 24, overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
              <div>
                <div className="activity-badge" style={{ marginBottom: 4 }}>History</div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  {rewardTitle} History
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Personal log of earned {rewardTitle.toLowerCase()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* History Items Container */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loadingHistory ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 0' }}>
                  <div className="spinner" />
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading history...</span>
                </div>
              ) : historyError ? (
                <div className="activity-message error">
                  <span>✕ {historyError}</span>
                  <button
                    type="button"
                    onClick={handleOpenHistory}
                    style={{ marginLeft: 12, background: 'none', border: 'underline', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Retry
                  </button>
                </div>
              ) : historyData.length === 0 ? (
                <div className="admin-empty-state">No points history record found.</div>
              ) : (
                <>
                  {/* Total Earned Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-input)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL EARNED HISTORY</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>
                      +{historyData.reduce((acc, curr) => acc + (curr.points || 0), 0)} pts
                    </span>
                  </div>

                  {historyData.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justify: 'space-between',
                        gap: 12,
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '12px 14px',
                        transition: 'var(--transition)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                          ⭐
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>📅 {item.date}</span>
                            {item.reference_type && (
                              <span style={{ textTransform: 'capitalize', background: 'var(--bg-card)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                                {item.reference_type}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: '#22c55e', background: 'rgba(34,197,94,0.12)', padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(34,197,94,0.3)' }}>
                          +{item.points} pts
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="modal-btn cancel"
                style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

function Points() {
  // Main Tab State: 'opportunity' | 'activity' | 'responsiveness'
  const [activeMainTab, setActiveMainTab] = useState('opportunity')

  return (
    <main className="activity-shell">
      <section className="activity-page-card">
        <div className="activity-page-content">
          
          {/* Header */}
          <div className="activity-page-header">
            <div>
              <div className="activity-badge">Rewards & Scores</div>
              <h1 style={{ marginTop: 6, fontSize: 24, fontWeight: 800 }}>Points Leaderboard</h1>
            </div>
          </div>

          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: -6, marginBottom: 20 }}>
            Track performance standings, student rankings, and point allocations across campus modules.
          </p>

          {/* Main 3 Tabs Header */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              borderBottom: '1px solid var(--border)',
              paddingBottom: 12,
              marginBottom: 20,
              overflowX: 'auto',
              whiteSpace: 'nowrap'
            }}
          >
            <button
              type="button"
              onClick={() => setActiveMainTab('opportunity')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeMainTab === 'opportunity' ? 'var(--accent)' : 'var(--bg-input)',
                color: activeMainTab === 'opportunity' ? '#fff' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'var(--transition)'
              }}
            >
              Opportunity Points
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab('activity')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeMainTab === 'activity' ? 'var(--accent)' : 'var(--bg-input)',
                color: activeMainTab === 'activity' ? '#fff' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'var(--transition)'
              }}
            >
              Activity Points
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab('responsiveness')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeMainTab === 'responsiveness' ? 'var(--accent)' : 'var(--bg-input)',
                color: activeMainTab === 'responsiveness' ? '#fff' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'var(--transition)'
              }}
            >
              Responsiveness Score
            </button>
          </div>

          {/* TAB 1: OPPORTUNITY POINTS (ID = 6) */}
          {activeMainTab === 'opportunity' && (
            <LeaderboardSection rewardId="6" rewardTitle="Opportunity Points" />
          )}

          {/* TAB 2: ACTIVITY POINTS (ID = 1) */}
          {activeMainTab === 'activity' && (
            <LeaderboardSection rewardId="1" rewardTitle="Activity Points" />
          )}

          {/* TAB 3: RESPONSIVENESS SCORE (ID = 5) */}
          {activeMainTab === 'responsiveness' && (
            <LeaderboardSection rewardId="5" rewardTitle="Responsiveness Score" />
          )}

        </div>
      </section>
    </main>
  )
}

export default Points
