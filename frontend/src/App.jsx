import { useState, useEffect, useRef, useCallback } from 'react'
import zoomSdk from '@zoom/appssdk'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const ANALYZE_MINUTES = 10  // 提案時に参照する直近の分数

function useSessionId() {
  const [sessionId, setSessionId] = useState(null)
  const isZoomEnv = useRef(false)

  useEffect(() => {
    async function init() {
      try {
        await zoomSdk.config({
          capabilities: [
            'getMeetingContext',
            'onMeetingTranscriptReceived',
          ],
          version: '0.16',
        })
        const ctx = await zoomSdk.getMeetingContext()
        setSessionId(`zoom-${ctx.meetingID}`)
        isZoomEnv.current = true
      } catch {
        const devId = `dev-${Date.now()}`
        setSessionId(devId)
        console.info('[アポ同席くん] Zoom SDK unavailable. Using dev session:', devId)
      }
    }
    init()
  }, [])

  return { sessionId, isZoomEnv }
}

const TYPE_CONFIG = {
  question: { label: '次に聞く・言う', color: '#2563eb' },
  appeal:   { label: '訴求ポイント',   color: '#059669' },
  warning:  { label: '地雷注意',       color: '#dc2626' },
}

function SuggestionCard({ suggestion }) {
  const cfg = TYPE_CONFIG[suggestion.type] || TYPE_CONFIG.question
  return (
    <div className="suggestion-card" style={{ borderLeftColor: cfg.color }}>
      <div className="suggestion-label" style={{ color: cfg.color }}>
        {cfg.label}
      </div>
      <div className="suggestion-content">{suggestion.content}</div>
    </div>
  )
}

function AttributeBadge({ label, value }) {
  if (!value || value === '不明') return null
  return <span className="badge">{label}: {value}</span>
}

function timeAgo(date) {
  if (!date) return null
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}秒前`
  return `${Math.floor(diff / 60)}分前`
}

const INTERVAL_OPTIONS = [
  { label: '切', value: null },
  { label: '1分', value: 1 },
  { label: '5分', value: 5 },
  { label: '10分', value: 10 },
]

export default function App() {
  const { sessionId, isZoomEnv } = useSessionId()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [transcript, setTranscript] = useState([])
  const [intervalMin, setIntervalMin] = useState(null)  // null = 手動のみ
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState(null)
  const [tick, setTick] = useState(0)  // 「X分前」表示の更新用

  // 「X秒前/分前」表示を毎秒更新
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 5000)
    return () => clearInterval(t)
  }, [])

  // 発言をバックエンドに記録（分析は発動しない）
  const recordTranscript = useCallback(async (speaker, text) => {
    if (!text.trim() || !sessionId) return
    try {
      await fetch(`${API_BASE}/session/${sessionId}/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker, text }),
      })
    } catch { /* サイレント失敗 */ }
  }, [sessionId])

  // 直近N分の会話をClaudeで分析して提案を取得
  const handleAnalyzeNow = useCallback(async () => {
    if (!sessionId || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/session/${sessionId}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: ANALYZE_MINUTES }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `API error: ${res.status}`)
      }
      const data = await res.json()
      setResult(data)
      setLastAnalyzedAt(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [sessionId, loading])

  // Zoom SDK の文字起こしイベントをリッスン
  useEffect(() => {
    if (!sessionId || !isZoomEnv.current) return

    zoomSdk.addEventListener('onMeetingTranscriptReceived', (event) => {
      const { transcriptText, participantRole } = event
      const speaker = participantRole === 'host' ? 'salesperson' : 'customer'
      setTranscript(prev => [...prev.slice(-30), { speaker, text: transcriptText }])
      recordTranscript(speaker, transcriptText)
    })

    return () => {
      if (sessionId) {
        fetch(`${API_BASE}/session/${sessionId}`, { method: 'DELETE' }).catch(() => {})
      }
    }
  }, [sessionId, recordTranscript])

  // 定期自動分析タイマー
  useEffect(() => {
    if (!intervalMin) return
    const t = setInterval(() => handleAnalyzeNow(), intervalMin * 60 * 1000)
    return () => clearInterval(t)
  }, [intervalMin, handleAnalyzeNow])

  // 開発用：手動で発言を入力してテスト
  const [devInput, setDevInput] = useState('')
  const [devSpeaker, setDevSpeaker] = useState('customer')

  function handleDevSubmit(e) {
    e.preventDefault()
    if (!devInput.trim()) return
    const text = devInput.trim()
    setTranscript(prev => [...prev.slice(-30), { speaker: devSpeaker, text }])
    recordTranscript(devSpeaker, text)
    setDevInput('')
  }

  if (!sessionId) {
    return <div className="loading-screen">初期化中...</div>
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>アポ同席くん</h1>
        <span className={`status ${loading ? 'analyzing' : 'ready'}`}>
          {loading ? '分析中...' : '待機中'}
        </span>
      </header>

      {/* コントロールパネル */}
      <section className="control-section">
        <div className="section-title">自動分析</div>
        <div className="interval-buttons">
          {INTERVAL_OPTIONS.map(opt => (
            <button
              key={String(opt.value)}
              className={`interval-btn ${intervalMin === opt.value ? 'active' : ''}`}
              onClick={() => setIntervalMin(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          className="analyze-now-btn"
          onClick={handleAnalyzeNow}
          disabled={loading}
        >
          {loading ? '分析中...' : '今すぐ提案'}
        </button>
        {lastAnalyzedAt && (
          <div className="last-analyzed">
            最終分析: {timeAgo(lastAnalyzedAt)}
          </div>
        )}
      </section>

      {/* 推測プロファイル */}
      {result?.detected_attributes && (
        <section className="profile-section">
          <div className="section-title">推測プロファイル</div>
          <div className="badges">
            <AttributeBadge label="年齢層" value={result.detected_attributes.age_group} />
            <AttributeBadge label="性別" value={result.detected_attributes.gender} />
            <AttributeBadge label="職種" value={result.detected_attributes.occupation} />
          </div>
          <div className="mode-badge">{result.detected_attributes.mode}</div>
        </section>
      )}

      {/* 商談フェーズ */}
      {result?.current_phase && (
        <section className="phase-section">
          <span className="phase-label">{result.current_phase}</span>
        </section>
      )}

      {/* シグナル */}
      {result?.signal_detected && (
        <section className="signal-section">
          <div className="section-title">今のシグナル</div>
          <div className="signal-text">{result.signal_detected}</div>
        </section>
      )}

      {/* 提案 */}
      {result?.suggestions && result.suggestions.length > 0 && (
        <section className="suggestions-section">
          <div className="section-title">次にすること</div>
          {result.suggestions.map((s, i) => (
            <SuggestionCard key={i} suggestion={s} />
          ))}
        </section>
      )}

      {/* エラー */}
      {error && <div className="error-banner">エラー: {error}</div>}

      {/* 開発環境用入力欄 */}
      {!isZoomEnv.current && (
        <section className="dev-input-section">
          <div className="section-title">開発用テスト入力</div>
          <form onSubmit={handleDevSubmit} className="dev-form">
            <div className="dev-speaker-toggle">
              <button
                type="button"
                className={`speaker-btn ${devSpeaker === 'customer' ? 'active' : ''}`}
                onClick={() => setDevSpeaker('customer')}
              >お客様</button>
              <button
                type="button"
                className={`speaker-btn ${devSpeaker === 'salesperson' ? 'active' : ''}`}
                onClick={() => setDevSpeaker('salesperson')}
              >営業</button>
            </div>
            <input
              type="text"
              value={devInput}
              onChange={(e) => setDevInput(e.target.value)}
              placeholder="発言を入力..."
              className="dev-input"
            />
            <button type="submit" className="dev-submit">追加</button>
          </form>
          <div className="transcript-log">
            {transcript.slice(-8).map((t, i) => (
              <div key={i} className={`transcript-item ${t.speaker}`}>
                <span className="transcript-speaker">
                  {t.speaker === 'customer' ? 'お客様' : '営業'}
                </span>
                {t.text}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
