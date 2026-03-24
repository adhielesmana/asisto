import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import Head from 'next/head'

function getApiUrl() {
  if (typeof window === 'undefined') return '/api/ai/ask'
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
  if (configuredBaseUrl) return `${configuredBaseUrl.replace(/\/$/, '')}/api/ai/ask`
  const { protocol, hostname, port } = window.location
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && port !== '4000') {
    return `${protocol}//${hostname}:4000/api/ai/ask`
  }
  return '/api/ai/ask'
}

const EditorIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
)

const ChatIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
)

const FolderIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
)

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a1.65 1.65 0 0 0 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
)

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      content:
        'Welcome to ASISTO IDE! 🚀\nI can help you build your application. Try asking for some code, and you can apply it directly to the editor using the "APPLY" button and then run it in the terminal.',
    },
  ])
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState(
    `// Welcome to ASISTO IDE\n\nfunction helloWorld() {\n  console.log("Modern UI is here!");\n}\n\nhelloWorld();`
  )
  const [activeTab, setActiveTab] = useState('chat')
  const [terminalLogs, setTerminalLogs] = useState([
    { type: 'info', text: 'Initializing ASISTO environment...' },
    { type: 'info', text: 'Backend connected to http://localhost:4000' },
  ])
  const [envTree, setEnvTree] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const chatEndRef = useRef(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const loadTree = async () => {
      try {
        const res = await fetch('/api/environments')
        if (!res.ok) throw new Error('Unable to load environment tree')
        const data = await res.json()
        setEnvTree(data.environments || [])
        const firstFile = findFirstFile(data.environments || [])
        if (firstFile) {
          loadEnvFile(firstFile)
        }
      } catch (error) {
        setTerminalLogs((prev) => [...prev, { type: 'error', text: 'Unable to load environments.' }])
      }
    }

    loadTree()
  }, [])

  const applyCode = (newCode) => {
    setCode(newCode)
    setTerminalLogs((prev) => [...prev, { type: 'success', text: 'Applied new code to editor.' }])
  }

  const runCode = () => {
    setTerminalLogs((prev) => [...prev, { type: 'info', text: 'Running index.js...' }])
    setTimeout(() => {
      setTerminalLogs((prev) => [...prev, { type: 'output', text: '> Modern UI is here!' }])
    }, 500)
  }

  const askAI = async () => {
    if (!prompt.trim()) return

    const userMessage = { role: 'user', content: prompt }
    setMessages((prev) => [...prev, userMessage])
    setPrompt('')
    setLoading(true)

    try {
      const res = await axios.post(getApiUrl(), {
        prompt: prompt,
        preferKnowledge: false,
      })

      const aiResponse = {
        role: 'ai',
        content: res.data.response,
        metadata: {
          provider: res.data.provider,
          model: res.data.model,
          strategy: res.data.strategy,
        },
      }
      setMessages((prev) => [...prev, aiResponse])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', content: `Error: ${err.response?.data?.details || 'Request failed.'}`, isError: true },
      ])
    } finally {
      setLoading(false)
    }
  }

  const renderContentWithCodeAction = (content) => {
    const codeBlockRegex = /```(?:[a-z]+)?\n([\s\S]*?)```/g
    const parts = []
    let lastIndex = 0
    let match

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={lastIndex}>{content.slice(lastIndex, match.index)}</span>)
      }
      const codeToApply = match[1]
      parts.push(
        <div key={match.index} className="code-container">
          <pre>{codeToApply}</pre>
          <button className="apply-code-btn" onClick={() => applyCode(codeToApply)}>
            APPLY TO EDITOR
          </button>
        </div>
      )
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < content.length) {
      parts.push(<span key={lastIndex}>{content.slice(lastIndex)}</span>)
    }

  return parts.length > 0 ? parts : content
  }

  const findFirstFile = (nodes) => {
    if (!nodes?.length) return null
    for (const node of nodes) {
      if (node.type === 'file') return node
      if (node.children?.length) {
        const deep = findFirstFile(node.children)
        if (deep) return deep
      }
    }
    return null
  }

  const loadEnvFile = async (node) => {
    if (!node || node.type !== 'file') return
    try {
      const res = await fetch(`/api/env-file?path=${encodeURIComponent(node.path)}`)
      if (!res.ok) throw new Error('failed to load')
      const text = await res.text()
      setCode(text)
      setSelectedFile(node)
      setTerminalLogs((prev) => [...prev, { type: 'info', text: `Loaded ${node.name}` }])
    } catch (error) {
      setTerminalLogs((prev) => [...prev, { type: 'error', text: `Unable to load ${node.name}` }])
    }
  }

  const renderEnvNode = (node, level = 0) => {
    if (!node) return null
    if (node.type === 'folder') {
      return (
        <div key={node.path} className="env-folder">
          <div className="env-folder-label" style={{ paddingLeft: level * 12 + 12 }}>
            {node.name}
          </div>
          <div className="env-folder-children">{node.children?.map((child) => renderEnvNode(child, level + 1))}</div>
        </div>
      )
    }

    return (
      <div
        key={node.path}
        className={`env-file ${selectedFile?.path === node.path ? 'active' : ''}`}
        style={{ paddingLeft: level * 12 + 24 }}
        onClick={() => loadEnvFile(node)}
      >
        {node.name}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Head>
        <title>ASISTO | AI Editor</title>
        <meta name="description" content="Next generation AI-powered coding workspace" />
      </Head>

      <div className="app-header">
        <div className="brand">
          <div className="brand-icon">AS</div>
          <div>
            <div className="brand-title">ASISTO AI Dev Cloud</div>
            <div className="brand-subtitle">Replit/Antigravity inspired workspace with Codex vibes.</div>
          </div>
        </div>
        <div className="header-actions">
          <div className="status-chip">llama3 • local</div>
          <div className="status-chip subtle">Puter fallback ready</div>
          <button className="primary-btn">New Session</button>
        </div>
      </div>

      <div className="workspace-grid">
        <div className="explorer-column">
          <div className="activity-bar">
            <button className={`icon-btn ${activeTab === 'explorer' ? 'active' : ''}`} onClick={() => setActiveTab('explorer')}>
              <FolderIcon />
            </button>
            <button className={`icon-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
              <ChatIcon />
            </button>
            <div className="activity-spacer" />
            <button className="icon-btn secondary">
              <SettingsIcon />
            </button>
          </div>
          <div className="sidebar glass">
            <div className="panel-header">{activeTab === 'explorer' ? 'Explorer' : 'Chat History'}</div>
            <div className="sidebar-content">
              {activeTab === 'explorer' ? (
                envTree.length ? (
                envTree.map((node) => (
                  <div key={`root-${node.path}`} className="env-tree-root">
                    {renderEnvNode(node)}
                  </div>
                ))
                ) : (
                  <div className="empty-history">
                    <div>No environments detected yet.</div>
                    <small>Run `./deploy.sh` to create environment folders.</small>
                  </div>
                )
              ) : (
                <div className="empty-history">
                  <div>No past conversations yet.</div>
                  <small>AI answers appear here once you start chatting.</small>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="workspace-column glass">
          <div className="workspace-header">
            <div className="workspace-title">
              <span className="workspace-indicator" />
              index.js — asisto-frontend
            </div>
            <div className="workspace-controls">
              <button className="ghost-btn" onClick={runCode}>
                RUN
              </button>
            </div>
          </div>

          <div className="editor-grid">
            <div className="line-numbers">
              {code.split('\n').map((_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck="false" className="code-editor" />
          </div>

          <div className="editor-status-bar">
            <span>UTF-8</span>
            <span>JavaScript</span>
            <span className="status-spacer" />
            <span>
              Ln {code.split('\n').length}, Col {code.split('\n').pop().length + 1}
            </span>
          </div>

          <div className="terminal-area">
            <div className="terminal-header">
              <div className="terminal-tab active">TERMINAL</div>
              <div className="terminal-tab">OUTPUT</div>
              <div className="terminal-tab">DEBUG</div>
            </div>
            <div className="terminal-content">
              {terminalLogs.map((log, i) => (
                <div key={i} className={`terminal-log ${log.type}`}>
                  <span className="log-label">[{log.type.toUpperCase()}]</span>
                  <span>{log.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="assistant-panel glass">
          <div className="panel-header">
            <ChatIcon />
            <span>AI ASSISTANT</span>
          </div>
          <div className="chat-history">
            {messages.map((m, i) => (
              <div key={i} className={`message ${m.role} ${m.isError ? 'error' : ''}`}>
                <div className="message-header">
                  <span className="message-label">{m.role === 'ai' ? 'ASISTO BOT' : 'DEVELOPER'}</span>
                  {m.metadata && <span className="message-meta">{m.metadata.model}</span>}
                </div>
                <div className="message-body">{m.role === 'ai' ? renderContentWithCodeAction(m.content) : m.content}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-area">
            <textarea
              rows={3}
              placeholder="How should I modify the code?"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  askAI()
                }
              }}
            />
            <button onClick={askAI} disabled={loading || !prompt.trim()} className="send-btn">
              {loading ? <span className="loader"></span> : 'Send'}
            </button>
          </div>
        </aside>
      </div>

      <style jsx>{`
        :global(body) {
          margin: 0;
          font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif;
          background: #05070c;
        }

        .app-shell {
          min-height: 100vh;
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          color: #f5f5f5;
          background: radial-gradient(circle at top, rgba(96, 165, 250, 0.25), transparent 45%) #020409;
        }

        .app-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 20px 45px rgba(2, 2, 5, 0.6);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .brand-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, #2563eb, #9333ea);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .brand-title {
          font-size: 18px;
          font-weight: 700;
        }

        .brand-subtitle {
          font-size: 12px;
          color: rgba(226, 232, 240, 0.8);
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .status-chip {
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 11px;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .status-chip.subtle {
          opacity: 0.7;
        }

        .primary-btn {
          background: linear-gradient(135deg, #f97316, #ec4899);
          border: none;
          color: #fff;
          font-weight: 600;
          padding: 10px 20px;
          border-radius: 10px;
          cursor: pointer;
        }

        .workspace-grid {
          display: grid;
          grid-template-columns: 100px minmax(0, 1fr) 320px;
          gap: 20px;
        }

        @media (max-width: 1100px) {
          .workspace-grid {
            grid-template-columns: 80px minmax(0, 1fr);
          }

          .assistant-panel {
            grid-column: 1 / -1;
            order: 4;
          }
        }

        .explorer-column {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .activity-bar {
          background: rgba(15, 23, 42, 0.8);
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px 0;
          gap: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .icon-btn {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          border: none;
          background: transparent;
          color: #9ca3af;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon-btn.active {
          background: rgba(37, 99, 235, 0.2);
          color: #93c5fd;
        }

        .icon-btn.secondary {
          margin-top: auto;
        }

        .activity-spacer {
          flex: 1;
        }

        .sidebar {
          min-height: 320px;
        }

        .glass {
          background: rgba(15, 23, 42, 0.85);
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 25px 40px rgba(2, 6, 23, 0.7);
        }

        .panel-header {
          padding: 16px 24px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .sidebar-content {
          padding: 0 24px 24px;
          font-size: 13px;
          color: rgba(226, 232, 240, 0.85);
        }

        .folder-tree {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .env-tree-root {
          margin-bottom: 12px;
        }

        .env-folder-label {
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: rgba(241, 245, 249, 0.8);
          margin-bottom: 4px;
        }

        .env-folder-children {
          margin-left: 6px;
        }

        .env-file {
          cursor: pointer;
          padding: 6px 8px;
          border-radius: 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: rgba(226, 232, 240, 0.9);
        }

        .env-file.active {
          background: rgba(59, 130, 246, 0.2);
          color: #bfdbfe;
        }

        .folder-item {
          padding: 6px 10px;
          border-radius: 8px;
          cursor: pointer;
        }

        .folder-item.active {
          background: rgba(37, 99, 235, 0.12);
          color: #bfdbfe;
        }

        .empty-history {
          font-size: 12px;
          opacity: 0.7;
        }

        .workspace-column {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 24px;
        }

        .workspace-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .workspace-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          letter-spacing: 0.05em;
        }

        .workspace-indicator {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #10b981;
          box-shadow: 0 0 10px #10b981;
        }

        .ghost-btn {
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: transparent;
          padding: 6px 14px;
          color: #e5e7eb;
          font-weight: 600;
          cursor: pointer;
        }

        .editor-grid {
          display: flex;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(15, 23, 42, 0.9);
        }

        .line-numbers {
          background: #0f172a;
          padding: 20px 8px;
          text-align: right;
          color: #475569;
          font-size: 12px;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          display: flex;
          flex-direction: column;
          gap: 2px;
          user-select: none;
        }

        .code-editor {
          flex: 1;
          padding: 20px;
          border: none;
          background: transparent;
          color: #f8fafc;
          font-size: 14px;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          min-height: 320px;
          resize: none;
          line-height: 1.6;
          outline: none;
        }

        .editor-status-bar {
          display: flex;
          padding: 0 12px 12px;
          font-size: 12px;
          color: rgba(243, 244, 246, 0.7);
          align-items: center;
        }

        .status-spacer {
          flex: 1;
        }

        .terminal-area {
          background: rgba(2, 6, 23, 0.75);
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          padding: 12px;
        }

        .terminal-header {
          display: flex;
          gap: 12px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          margin-bottom: 8px;
        }

        .terminal-tab {
          padding: 4px 10px;
          border-radius: 8px;
          cursor: pointer;
          background: rgba(148, 163, 184, 0.1);
          color: rgba(226, 232, 240, 0.7);
        }

        .terminal-tab.active {
          background: rgba(37, 99, 235, 0.2);
          color: #f8fafc;
        }

        .terminal-content {
          max-height: 160px;
          overflow-y: auto;
          font-size: 13px;
          padding-right: 8px;
        }

        .terminal-log {
          margin-bottom: 6px;
        }

        .terminal-log.info .log-label {
          color: #60a5fa;
        }

        .terminal-log.output .log-label {
          color: #34d399;
        }

        .terminal-log.success .log-label {
          color: #10b981;
        }

        .terminal-log.error .log-label {
          color: #f87171;
        }

        .log-label {
          margin-right: 6px;
        }

        .assistant-panel {
          display: flex;
          flex-direction: column;
        }

        .chat-history {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .message {
          padding: 12px;
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.8);
        }

        .message.ai {
          border: 1px solid rgba(59, 130, 246, 0.25);
        }

        .message.user {
          border: 1px solid rgba(34, 197, 94, 0.25);
        }

        .message.error {
          border-color: rgba(248, 113, 113, 0.7);
        }

        .message-header {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          opacity: 0.7;
          margin-bottom: 4px;
        }

        .message-meta {
          font-size: 9px;
        }

        .message-body {
          font-size: 14px;
          line-height: 1.6;
        }

        .chat-input-area {
          padding: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          gap: 12px;
          position: relative;
        }

        .chat-input-area textarea {
          flex: 1;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(2, 6, 23, 0.7);
          padding: 12px;
          color: #f8fafc;
          resize: none;
          font-size: 13px;
          font-family: 'Inter', sans-serif;
        }

        .send-btn {
          border: none;
          background: linear-gradient(135deg, #a855f7, #3b82f6);
          color: #fff;
          padding: 0 24px;
          border-radius: 999px;
          font-weight: 600;
          cursor: pointer;
        }

        .loader {
          width: 14px;
          height: 14px;
          border: 2px solid #fff;
          border-bottom-color: transparent;
          border-radius: 50%;
          animation: rotation 1s linear infinite;
        }

        @keyframes rotation {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        .code-container pre {
          background: #020617;
          color: #f4f4f5;
          padding: 12px;
          border-radius: 8px;
          font-size: 12px;
          overflow-x: auto;
          font-family: 'JetBrains Mono', monospace;
        }

        .code-container {
          position: relative;
        }

        .apply-code-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          border: none;
          background: rgba(59, 130, 246, 0.9);
          color: #fff;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 10px;
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
