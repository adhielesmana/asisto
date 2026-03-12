import { useState } from 'react'
import axios from 'axios'

function getApiUrl() {
  if (typeof window === 'undefined') {
    return '/api/ai/ask'
  }

  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
  if (configuredBaseUrl) {
    return `${configuredBaseUrl.replace(/\/$/, '')}/api/ai/ask`
  }

  const { protocol, hostname, port } = window.location
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000') {
    return `${protocol}//${hostname}:4000/api/ai/ask`
  }

  return '/api/ai/ask'
}

export default function Home() {
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [preferKnowledge, setPreferKnowledge] = useState(false)

  const askAI = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt first.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await axios.post(getApiUrl(), {
        prompt,
        preferKnowledge,
      })
      setResult(res.data)
    } catch (requestError) {
      setResult(null)
      setError(requestError.response?.data?.details || 'Request failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: 'Arial, sans-serif', maxWidth: 960 }}>
      <h1>ASISTO AI Dev Cloud</h1>
      <p>
        Local questions stay on Ollama. Knowledge-heavy prompts can fall back to Puter and get cached
        for reuse.
      </p>

      <textarea
        rows={8}
        cols={80}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Ask something here..."
        style={{ width: '100%', padding: 12 }}
      />

      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <label>
          <input
            type="checkbox"
            checked={preferKnowledge}
            onChange={(event) => setPreferKnowledge(event.target.checked)}
            style={{ marginRight: 8 }}
          />
          Force Puter fallback before trying Ollama
        </label>
      </div>

      <button onClick={askAI} disabled={loading}>
        {loading ? 'Thinking...' : 'Ask AI'}
      </button>

      {error ? (
        <p style={{ color: '#b91c1c', marginTop: 20 }}>
          {error}
        </p>
      ) : null}

      {result ? (
        <div style={{ marginTop: 24 }}>
          <p><strong>Provider:</strong> {result.provider}</p>
          <p><strong>Model:</strong> {result.model}</p>
          <p><strong>Strategy:</strong> {result.strategy}</p>
          <p><strong>Cached:</strong> {result.cached ? 'yes' : 'no'}</p>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 16 }}>
            {result.response}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
