import { useEffect, useState, useMemo } from 'react'
import { getNotifications, getSurveyQuestions, submitSurvey } from '../api/auth.js'

function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState('all') // 'all' | 'active' | 'expired' | 'surveys' | 'accepted' | 'declined'
  const [sortOrder, setSortOrder] = useState('newest') // 'newest' | 'oldest'
  const [selectedNotification, setSelectedNotification] = useState(null)
  const [expandedIds, setExpandedIds] = useState(new Set())

  // Survey Modal state
  const [activeSurvey, setActiveSurvey] = useState(null) // { surveyId, title }
  const [questions, setQuestions] = useState([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [questionsError, setQuestionsError] = useState('')
  const [surveyAnswers, setSurveyAnswers] = useState({}) // { [questionId]: response_content }
  const [submittingSurvey, setSubmittingSurvey] = useState(false)
  const [surveyResult, setSurveyResult] = useState(null) // { success: bool, text: str }

  const fetchNotifications = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getNotifications()
      if (res && Array.isArray(res.data)) {
        setNotifications(res.data)
      } else if (Array.isArray(res)) {
        setNotifications(res)
      } else {
        setNotifications([])
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Open Interactive Survey Modal
  const openSurveyModal = async (surveyId, title) => {
    if (!surveyId) return
    setActiveSurvey({ surveyId, title })
    setQuestionsLoading(true)
    setQuestionsError('')
    setQuestions([])
    setSurveyAnswers({})
    setSurveyResult(null)

    try {
      const res = await getSurveyQuestions(surveyId)
      if (res && Array.isArray(res.data)) {
        setQuestions(res.data)
      } else if (Array.isArray(res)) {
        setQuestions(res)
      } else {
        setQuestions([])
      }
    } catch (err) {
      setQuestionsError(err.message || 'Failed to load survey questions')
    } finally {
      setQuestionsLoading(false)
    }
  }

  // Option selection handler for survey
  const handleSelectOption = (questionId, optionValue) => {
    setSurveyAnswers((prev) => ({
      ...prev,
      [questionId]: optionValue
    }))
  }

  // Check if a question should be visible based on parent_question_id and trigger_value
  const isQuestionVisible = (q) => {
    if (!q.parent_question_id) return true
    const parentAns = surveyAnswers[q.parent_question_id]
    if (!parentAns) return false
    if (!q.trigger_value) return true

    const parentStr = String(parentAns).trim().toLowerCase()
    const triggerStr = String(q.trigger_value).trim().toLowerCase()

    return parentStr === triggerStr || parentStr.includes(triggerStr)
  }

  // Survey submission handler
  const handleSurveySubmit = async (e) => {
    if (e) e.preventDefault()
    if (!activeSurvey) return

    // Validate required questions (only for visible questions)
    for (const q of questions) {
      if (isQuestionVisible(q) && !q.is_optional) {
        const val = surveyAnswers[q.id]
        if (!val || !String(val).trim()) {
          setQuestionsError(`Please answer the required question: "${q.question_title}"`)
          return
        }
      }
    }

    setSubmittingSurvey(true)
    setQuestionsError('')
    setSurveyResult(null)

    const answersPayload = questions
      .filter((q) => isQuestionVisible(q))
      .map((q) => ({
        question_id: q.id,
        response_content: surveyAnswers[q.id] || ''
      }))

    const payload = {
      activity_id: 0,
      survey_id: Number(activeSurvey.surveyId),
      activities_survey_id: 0,
      answers: answersPayload
    }

    try {
      const res = await submitSurvey(payload)
      const successText = res?.data || res?.message || 'Survey submitted successfully!'
      setSurveyResult({ success: true, text: successText })
    } catch (err) {
      setQuestionsError(err.message || 'Failed to submit survey')
    } finally {
      setSubmittingSurvey(false)
    }
  }

  // Stats calculation
  const stats = useMemo(() => {
    const total = notifications.length
    const active = notifications.filter((n) => !n.is_expired).length
    const expired = notifications.filter((n) => n.is_expired).length
    const surveys = notifications.filter((n) => n.screen === 'SurveyQuestions' || n.data?.surveyId).length
    return { total, active, expired, surveys }
  }, [notifications])

  // Filter & Sort
  const filteredNotifications = useMemo(() => {
    return notifications
      .filter((item) => {
        // Tab filtering
        if (filterTab === 'active' && item.is_expired) return false
        if (filterTab === 'expired' && !item.is_expired) return false
        if (filterTab === 'surveys' && !(item.screen === 'SurveyQuestions' || item.data?.surveyId)) return false
        if (filterTab === 'accepted' && item.action_status !== 'accepted') return false
        if (filterTab === 'declined' && item.action_status !== 'declined') return false

        // Search query filtering
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const titleMatch = item.title?.toLowerCase().includes(q)
          const descMatch = item.description?.toLowerCase().includes(q)
          const surveyMatch = String(item.data?.surveyId || '').includes(q)
          const idMatch = String(item.id).includes(q)
          return titleMatch || descMatch || surveyMatch || idMatch
        }

        return true
      })
      .sort((a, b) => {
        const timeA = new Date(a.created_at || 0).getTime()
        const timeB = new Date(b.created_at || 0).getTime()
        return sortOrder === 'newest' ? timeB - timeA : timeA - timeB
      })
  }, [notifications, filterTab, searchQuery, sortOrder])

  // Helper to render text with auto-linkified URLs
  const renderFormattedText = (text) => {
    if (!text) return null
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = text.split(urlRegex)

    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              color: 'var(--accent)',
              fontWeight: 600,
              textDecoration: 'underline',
              wordBreak: 'break-all'
            }}
          >
            {part}
          </a>
        )
      }
      return part
    })
  }

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <main className="activity-shell">
        <section className="activity-page-card">
          <div className="activity-page-content">
            <div className="activity-page-header">
              <div className="activity-badge">Notifications</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', justifyContent: 'center' }}>
              <div className="spinner" />
              <span>Fetching campus notifications...</span>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="activity-shell">
      <section className="activity-page-card">
        <div className="activity-page-content">
          {/* Header */}
          <div className="activity-page-header" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div className="activity-badge">PS App Feed</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0 0', color: 'var(--text-primary)' }}>
                Notifications & Announcements
              </h1>
            </div>

            <button
              type="button"
              className="share-ttl-chip active"
              onClick={fetchNotifications}
              style={{ fontSize: 13, padding: '6px 14px' }}
            >
              ⟳ Refresh Feed
            </button>
          </div>

          {/* Stats Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 12,
            margin: '16px 0 20px'
          }}>
            <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{stats.total}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Total Feed</div>
            </div>
            <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 'var(--radius-md)', padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>{stats.active}</div>
              <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>Active / Valid</div>
            </div>
            <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)', padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>{stats.expired}</div>
              <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>Expired</div>
            </div>
            <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-md)', padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{stats.surveys}</div>
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Surveys</div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            marginBottom: 20,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            padding: 16,
            borderRadius: 'var(--radius-md)'
          }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <input
                type="text"
                className="share-code-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, description, survey ID..."
                style={{ flex: 1, minWidth: 220, padding: '8px 14px', fontSize: 14 }}
              />

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: `All (${stats.total})` },
                { id: 'active', label: `Active (${stats.active})` },
                { id: 'expired', label: `Expired (${stats.expired})` },
                { id: 'surveys', label: `Surveys (${stats.surveys})` },
                { id: 'accepted', label: 'Accepted' },
                { id: 'declined', label: 'Declined' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`share-ttl-chip${filterTab === tab.id ? ' active' : ''}`}
                  onClick={() => setFilterTab(tab.id)}
                  style={{ fontSize: 12, padding: '4px 12px' }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="activity-message error" style={{ marginBottom: 16 }}>{error}</div>}

          {/* Notifications List */}
          {filteredNotifications.length === 0 ? (
            <div style={{
              padding: 40,
              textAlign: 'center',
              background: 'var(--bg-input)',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border)',
              color: 'var(--text-muted)'
            }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>No notifications found</p>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filteredNotifications.map((item) => {
                const isExpanded = expandedIds.has(item.id)
                const desc = item.description || ''
                const isLong = desc.length > 200
                const surveyId = item.data?.surveyId

                return (
                  <div
                    key={item.id}
                    style={{
                      background: 'var(--bg-card)',
                      border: `1.5px solid ${item.is_expired ? 'var(--border)' : 'var(--border-accent)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      transition: 'var(--transition)',
                      opacity: item.is_expired ? 0.85 : 1
                    }}
                  >
                    {/* Header Badges & Date */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Expired / Active status */}
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: item.is_expired ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.15)',
                          color: item.is_expired ? '#ef4444' : '#22c55e',
                          border: `1px solid ${item.is_expired ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`
                        }}>
                          {item.is_expired ? '🔴 Expired' : '🟢 Active'}
                        </span>

                        {/* Survey Badge */}
                        {(item.screen === 'SurveyQuestions' || surveyId) && (
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--accent-dim)',
                            color: 'var(--accent)',
                            border: '1px solid var(--border-accent)'
                          }}>
                            📝 Survey #{surveyId || ''}
                          </span>
                        )}

                        {/* Action Status */}
                        {item.action_status === 'accepted' && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                            ✓ Accepted
                          </span>
                        )}
                        {item.action_status === 'declined' && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                            ✕ Declined
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                        📅 {formatDate(item.created_at)}
                      </div>
                    </div>

                    {/* Title */}
                    <h3 style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      margin: 0,
                      lineHeight: 1.4
                    }}>
                      {item.title}
                    </h3>

                    {/* Description Body */}
                    {desc && (
                      <div style={{
                        fontSize: 14,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}>
                        {isExpanded || !isLong ? (
                          renderFormattedText(desc)
                        ) : (
                          renderFormattedText(desc.slice(0, 200) + '…')
                        )}
                      </div>
                    )}

                    {/* Expiry date tag */}
                    {item.expiry_date && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        ⏱ Expiry: {formatDate(item.expiry_date)}
                      </div>
                    )}

                    {/* Card Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4, pt: 8, borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {isLong && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(item.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent)',
                              fontSize: 13,
                              fontWeight: 600,
                              padding: 0,
                              cursor: 'pointer'
                            }}
                          >
                            {isExpanded ? '▲ Collapse Text' : '▼ Read Full Announcement'}
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {/* SURVEY BUTTON IF SURVEY ID PRESENT */}
                        {surveyId && (
                          <button
                            type="button"
                            onClick={() => openSurveyModal(surveyId, item.title)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 'var(--radius-sm)',
                              border: 'none',
                              background: 'var(--accent)',
                              color: '#fff',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            📝 Take Survey #{surveyId}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setSelectedNotification(item)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-accent)',
                            background: 'var(--accent-dim)',
                            color: 'var(--accent)',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          👁 View Full Modal
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* MODAL 1: INTERACTIVE SURVEY MODAL */}
      {activeSurvey && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1050,
          padding: 16
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border-accent)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            width: '100%',
            maxWidth: 620,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <span className="activity-badge" style={{ marginBottom: 4 }}>
                  Survey #{activeSurvey.surveyId}
                </span>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {activeSurvey.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveSurvey(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {questionsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '30px 0', justifyContent: 'center' }}>
                <div className="spinner" />
                <span>Loading survey questions...</span>
              </div>
            ) : questionsError ? (
              <div className="activity-message error">{questionsError}</div>
            ) : surveyResult ? (
              <div style={{
                padding: 20,
                borderRadius: 'var(--radius-md)',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.4)',
                color: '#22c55e',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                alignItems: 'center'
              }}>
                <div style={{ fontSize: 32 }}>🎉</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{surveyResult.text}</div>
                <button
                  type="button"
                  className="otp-submit-btn"
                  onClick={() => setActiveSurvey(null)}
                  style={{ maxWidth: 160, marginTop: 8 }}
                >
                  Done
                </button>
              </div>
            ) : questions.filter(isQuestionVisible).length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No questions found for this survey.</p>
            ) : (
              <form onSubmit={handleSurveySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {questions.filter(isQuestionVisible).map((q, idx) => (
                  <div
                    key={q.id}
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <label style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        {idx + 1}. {q.question_title}
                      </label>
                      {!q.is_optional && (
                        <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          * Required
                        </span>
                      )}
                    </div>

                    {q.question_description && (
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {q.question_description}
                      </div>
                    )}

                    {/* MCQ Options */}
                    {Array.isArray(q.options) && q.options.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                        {q.options.map((opt, oIdx) => {
                          const isSelected = surveyAnswers[q.id] === opt
                          return (
                            <label
                              key={oIdx}
                              onClick={() => handleSelectOption(q.id, opt)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '10px 14px',
                                borderRadius: 'var(--radius-sm)',
                                border: `1.5px solid ${isSelected ? 'var(--border-accent)' : 'var(--border)'}`,
                                background: isSelected ? 'var(--accent-dim)' : 'var(--bg-card)',
                                color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                                fontWeight: isSelected ? 700 : 500,
                                fontSize: 13,
                                cursor: 'pointer',
                                transition: 'var(--transition)'
                              }}
                            >
                              <input
                                type="radio"
                                name={`question_${q.id}`}
                                checked={isSelected}
                                onChange={() => handleSelectOption(q.id, opt)}
                                style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                              />
                              <span>{opt}</span>
                            </label>
                          )
                        })}
                      </div>
                    ) : (
                      /* Open Text Response Input */
                      <textarea
                        className="share-code-input"
                        rows={3}
                        value={surveyAnswers[q.id] || ''}
                        onChange={(e) => handleSelectOption(q.id, e.target.value)}
                        placeholder="Type your response here..."
                        style={{ fontSize: 13, padding: '10px 12px', resize: 'vertical' }}
                      />
                    )}
                  </div>
                ))}

                <button
                  type="submit"
                  className="otp-submit-btn"
                  disabled={submittingSurvey}
                  style={{ width: '100%', marginTop: 8 }}
                >
                  {submittingSurvey ? <span className="btn-spinner">⟳</span> : null}
                  🚀 Submit Survey Answers
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: FULL NOTIFICATION DETAIL MODAL */}
      {selectedNotification && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border-accent)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            width: '100%',
            maxWidth: 580,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <span className="activity-badge" style={{ marginBottom: 6 }}>Notification #{selectedNotification.id}</span>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {selectedNotification.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>📅 Posted: {formatDate(selectedNotification.created_at)}</span>
              {selectedNotification.expiry_date && (
                <span style={{ color: selectedNotification.is_expired ? '#ef4444' : '#22c55e' }}>
                  ⏱ Expiry: {formatDate(selectedNotification.expiry_date)}
                </span>
              )}
            </div>

            {selectedNotification.description && (
              <div style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
                fontSize: 14,
                color: 'var(--text-primary)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 300,
                overflowY: 'auto'
              }}>
                {renderFormattedText(selectedNotification.description)}
              </div>
            )}

            {/* Survey info block & Take survey button */}
            {selectedNotification.data?.surveyId && (
              <div style={{
                background: 'var(--accent-dim)',
                border: '1px solid var(--border-accent)',
                borderRadius: 'var(--radius-md)',
                padding: 14,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                    📝 Target Survey ID: {selectedNotification.data.surveyId}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Screen: {selectedNotification.screen}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const sid = selectedNotification.data.surveyId
                    const stitle = selectedNotification.title
                    setSelectedNotification(null)
                    openSurveyModal(sid, stitle)
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  Open Survey Form
                </button>
              </div>
            )}

            <button
              type="button"
              className="otp-submit-btn"
              onClick={() => setSelectedNotification(null)}
              style={{ marginTop: 8 }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

export default Notifications
