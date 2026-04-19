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

const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
)

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
)

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
)

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  </svg>
)

export default function Home() {
  const [threads, setThreads] = useState([])
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [folderTree, setFolderTree] = useState([])
  const [showFolders, setShowFolders] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [codeOutput, setCodeOutput] = useState('')
  const [diffView, setDiffView] = useState(null)
  const [suggestedFilename, setSuggestedFilename] = useState('')
  const chatEndRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threads])

  useEffect(() => {
    const loadFolders = async () => {
      try {
        const res = await fetch('/api/environments')
        if (res.ok) {
          const data = await res.json()
          setFolderTree(data.environments || [])
        }
      } catch (error) {
        console.error('Failed to load environments:', error)
      }
    }
    loadFolders()
  }, [])

  const activeThread = threads.find((t) => t.id === activeThreadId)

  const extractCodeBlocks = (text) => {
    const regex = /```(?:javascript|js|typescript|ts|jsx|tsx|python|py|html|css|json)?\n([\s\S]*?)```/g
    const blocks = []
    let match
    while ((match = regex.exec(text)) !== null) {
      blocks.push(match[1].trim())
    }
    return blocks
  }

  const generateDiff = async (code) => {
    try {
      const filename = `generated_${Date.now()}.js`
      setSuggestedFilename(filename)

      // Fetch existing file if it exists (for diff comparison)
      try {
        await axios.get('/api/files/read', {
          params: { path: `${activeThread.folder}/${filename}` }
        })
      } catch (e) {
        // File doesn't exist, that's fine - diff will be all additions
      }

      // Generate diff showing what will be added
      const diffRes = await axios.post('/api/files/diff', {
        original: '',
        modified: code
      })

      setDiffView(diffRes.data.diff || [])
    } catch (error) {
      console.error('Failed to generate diff:', error)
      setDiffView(null)
    }
  }

  const askAI = async () => {
    if (!prompt.trim()) return

    const newMessages = [
      ...activeThread.messages,
      { role: 'user', content: prompt, timestamp: new Date().toISOString() },
    ]

    setThreads(threads.map((t) => (t.id === activeThreadId ? { ...t, messages: newMessages } : t)))
    setPrompt('')
    setLoading(true)
    setDiffView(null)

    try {
      const res = await axios.post(getApiUrl(), { prompt, preferKnowledge: false })

      const codeBlocks = extractCodeBlocks(res.data.response)
      if (codeBlocks.length > 0) {
        const code = codeBlocks[0]
        setCodeOutput(code)
        if (activeThread.folder) {
          await generateDiff(code)
        }
      }

      const newMessages2 = [
        ...newMessages,
        {
          role: 'ai',
          content: res.data.response,
          codeBlocks,
          metadata: res.data,
          timestamp: new Date().toISOString(),
        },
      ]

      setThreads(threads.map((t) => (t.id === activeThreadId ? { ...t, messages: newMessages2 } : t)))
    } catch (error) {
      const errorMsg = [
        ...newMessages,
        { role: 'ai', content: `Error: ${error.response?.data?.details || 'Request failed'}`, isError: true },
      ]
      setThreads(threads.map((t) => (t.id === activeThreadId ? { ...t, messages: errorMsg } : t)))
    } finally {
      setLoading(false)
    }
  }

  const applyCode = async () => {
    if (!activeThread.folder || !codeOutput) return

    try {
      await axios.post('/api/files/write', {
        path: `${activeThread.folder}/${suggestedFilename}`,
        content: codeOutput,
      })

      const newMessages = [
        ...activeThread.messages,
        {
          role: 'system',
          content: `✅ Applied to ${activeThread.folder}/${suggestedFilename}`,
          isSystem: true,
        },
      ]
      setThreads(threads.map((t) => (t.id === activeThreadId ? { ...t, messages: newMessages } : t)))
      setCodeOutput('')
      setDiffView(null)
      setSuggestedFilename('')
    } catch (error) {
      console.error('Failed to apply:', error)
    }
  }

  const renderFolderTree = (nodes, level = 0) => {
    return (
      <>
        {nodes.map((node) => (
          <div key={node.path}>
            <div
              style={{ paddingLeft: level * 16 }}
              className={`folder-item ${node.type === 'folder' && activeThread.folder === `environments/${node.path}` ? 'active' : ''}`}
              onClick={() => {
                if (node.type === 'folder') {
                  setThreads(threads.map((t) => (t.id === activeThreadId ? { ...t, folder: `environments/${node.path}` } : t)))
                }
              }}
            >
              {node.type === 'folder' ? (
                <>
                  <FolderIcon /> {node.name}
                </>
              ) : (
                <span style={{ opacity: 0.6 }}>└ {node.name}</span>
              )}
            </div>
            {node.type === 'folder' && node.children && renderFolderTree(node.children, level + 1)}
          </div>
        ))}
      </>
    )
  }

  return (
    <div className="layout">
      <Head>
        <title>ASISTO - Claude Code Style</title>
      </Head>

      {/* LEFT SIDEBAR */}
      <div className="sidebar">
        <div className="sidebar-header">
          <button
            className="btn-new"
            onClick={() => {
              const newId = Math.max(...threads.map((t) => t.id), 0) + 1
              setThreads([...threads, { id: newId, name: `Session ${newId}`, messages: [], folder: null }])
              setActiveThreadId(newId)
            }}
          >
            <PlusIcon /> New
          </button>
        </div>

        <div className="sidebar-content">
          <div className="sessions-label">SESSIONS</div>
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={`session-item ${activeThreadId === thread.id ? 'active' : ''}`}
              onClick={() => setActiveThreadId(thread.id)}
            >
              <div className="session-name">{thread.name}</div>
              {threads.length > 1 && (
                <button
                  className="btn-delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    const remaining = threads.filter((t) => t.id !== thread.id)
                    setThreads(remaining)
                    if (activeThreadId === thread.id) {
                      setActiveThreadId(remaining[0].id)
                    }
                  }}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="section-header">
            <button className="btn-toggle-folders" onClick={() => setShowFolders(!showFolders)}>
              {showFolders ? '▼' : '▶'}
            </button>
            <span>ENVIRONMENTS</span>
          </div>
          {showFolders && (
            <div className="folders-list">
              {folderTree.length === 0 ? (
                <div className="empty-folders">No environments found</div>
              ) : (
                renderFolderTree(folderTree)
              )}
            </div>
          )}
          {activeThread && activeThread.folder && (
            <div className="selected-folder-badge">
              ✓ Working in: <strong>{activeThread.folder.replace('environments/', '')}</strong>
            </div>
          )}
        </div>
      </div>

      {/* MAIN AREA */}
      <div className="main">
        {/* HEADER */}
        <div className="header">
          <div className="breadcrumb">
            <span className="breadcrumb-item">asisto</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-item">
              {activeThread ? (activeThread.folder ? activeThread.folder : 'Select environment') : 'Create new session'}
            </span>
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="content">
          {!activeThread ? (
            <div className="empty-state">
              <div className="empty-state-icon">+</div>
              <div className="empty-state-text">Create a new session to get started</div>
              <button
                className="empty-state-btn"
                onClick={() => {
                  const newId = 1
                  setThreads([{ id: newId, name: 'Session 1', messages: [], folder: null }])
                  setActiveThreadId(newId)
                }}
              >
                New Session
              </button>
            </div>
          ) : (
            <>
          {/* CHAT */}
          <div className="chat-area">
            <div className="messages">
              {activeThread?.messages.map((msg, i) => (
                <div key={i} className={`message message-${msg.role} ${msg.isError ? 'error' : ''} ${msg.isSystem ? 'system' : ''}`}>
                  <div className="message-label">
                    {msg.role === 'user' ? 'You' : msg.role === 'ai' ? 'ASISTO' : 'System'}
                  </div>
                  <div className="message-text">
                    {msg.content}
                  </div>
                  {msg.metadata && (
                    <div className="message-meta">
                      {msg.metadata.provider} • {msg.metadata.model}
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="input-area">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    askAI()
                  }
                }}
                placeholder="Describe what you want to build..."
                className="input-box"
              />
              <button onClick={askAI} disabled={loading || !prompt.trim()} className="btn-send">
                {loading ? '...' : 'Send'}
              </button>
            </div>
          </div>

              {/* CODE OUTPUT */}
              {codeOutput && (
                <div className="code-area">
                  <div className="code-header">
                    <div>{diffView ? 'Diff Preview' : 'Generated Code'} {suggestedFilename && <span className="filename">{suggestedFilename}</span>}</div>
                    <button onClick={applyCode} disabled={!activeThread.folder} className="btn-apply">
                      {activeThread.folder ? 'Apply' : 'Select folder'}
                    </button>
                  </div>
                  <div className="code-block">
                    {diffView ? (
                      <div className="diff-container">
                        {diffView.map((item, i) => (
                          <div key={i} className={`diff-line diff-${item.type}`}>
                            <span className="diff-line-num">{item.lineNum}</span>
                            <span className="diff-marker">{item.type === 'removed' ? '−' : item.type === 'added' ? '+' : ' '}</span>
                            <span className="diff-content">{item.line}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <pre style={{ margin: 0 }}>{codeOutput}</pre>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        :global(body) {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0f0f0f;
          color: #e5e5e5;
        }

        .layout {
          display: flex;
          height: 100vh;
          background: #0f0f0f;
        }

        .sidebar {
          width: 240px;
          background: #1a1a1a;
          border-right: 1px solid #333;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        .sidebar-header {
          padding: 16px;
          border-bottom: 1px solid #333;
        }

        .btn-new {
          width: 100%;
          padding: 8px 12px;
          background: #2d2d2d;
          border: 1px solid #444;
          border-radius: 6px;
          color: #e5e5e5;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .btn-new:hover {
          background: #3d3d3d;
          border-color: #555;
        }

        .sidebar-content {
          flex: 1;
          padding: 12px 8px;
          overflow-y: auto;
        }

        .sessions-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #888;
          padding: 12px 8px;
          margin-bottom: 4px;
        }

        .session-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          margin-bottom: 4px;
          border-radius: 6px;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s;
        }

        .session-item:hover {
          background: #2d2d2d;
        }

        .session-item.active {
          background: #333;
          border-left: 2px solid #4a9eff;
          padding-left: 8px;
        }

        .session-name {
          flex: 1;
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .btn-delete {
          background: transparent;
          border: none;
          color: #888;
          cursor: pointer;
          padding: 4px;
          opacity: 0;
          transition: all 0.2s;
        }

        .session-item:hover .btn-delete {
          opacity: 1;
          color: #ff6b6b;
        }

        .sidebar-footer {
          padding: 12px 8px;
          border-top: 1px solid #333;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 10px;
          margin-bottom: 8px;
        }

        .btn-toggle-folders {
          background: transparent;
          border: none;
          color: #888;
          font-size: 12px;
          cursor: pointer;
          padding: 0;
          width: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .btn-toggle-folders:hover {
          color: #e5e5e5;
        }

        .section-header span {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #888;
          flex: 1;
        }

        .folders-list {
          margin-bottom: 12px;
          padding: 8px 0;
          font-size: 12px;
          background: #0a0a0a;
          border-radius: 6px;
          padding: 8px;
        }

        .empty-folders {
          padding: 12px 8px;
          font-size: 12px;
          color: #666;
          text-align: center;
        }

        .selected-folder-badge {
          padding: 10px 12px;
          background: #2d5a7b;
          border: 1px solid #4a9eff;
          border-radius: 6px;
          font-size: 11px;
          color: #4a9eff;
          margin-top: auto;
        }

        .selected-folder-badge strong {
          color: #93d5ff;
        }

        .folder-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.2s;
          color: #aaa;
        }

        .folder-item:hover {
          background: #2d2d2d;
          color: #e5e5e5;
        }

        .folder-item.active {
          background: #2d5a7b;
          color: #4a9eff;
          font-weight: 500;
        }

        .main {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #0f0f0f;
          overflow: hidden;
        }

        .header {
          padding: 16px 24px;
          border-bottom: 1px solid #333;
          background: #151515;
        }

        .breadcrumb {
          font-size: 14px;
          color: #999;
        }

        .breadcrumb-item {
          color: #e5e5e5;
        }

        .breadcrumb-sep {
          margin: 0 6px;
          color: #555;
        }

        .content {
          flex: 1;
          display: flex;
          gap: 0;
          overflow: hidden;
        }

        .chat-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          border-right: 1px solid #333;
          overflow: hidden;
        }

        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .message {
          line-height: 1.6;
          font-size: 14px;
        }

        .message-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #888;
          margin-bottom: 4px;
          font-weight: 600;
        }

        .message-user .message-label {
          color: #4a9eff;
        }

        .message-ai .message-label {
          color: #888;
        }

        .message-text {
          color: #e5e5e5;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .message.error .message-text {
          color: #ff6b6b;
        }

        .message.system .message-text {
          color: #86efac;
          font-size: 13px;
        }

        .message-meta {
          font-size: 11px;
          color: #666;
          margin-top: 6px;
        }

        .input-area {
          padding: 20px 24px;
          border-top: 1px solid #333;
          display: flex;
          gap: 12px;
        }

        .input-box {
          flex: 1;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 12px;
          color: #e5e5e5;
          font-size: 13px;
          font-family: inherit;
          resize: none;
          max-height: 100px;
        }

        .input-box:focus {
          outline: none;
          border-color: #555;
          background: #222;
        }

        .btn-send {
          padding: 10px 20px;
          background: #2d2d2d;
          border: 1px solid #444;
          border-radius: 6px;
          color: #e5e5e5;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .btn-send:hover:not(:disabled) {
          background: #3d3d3d;
          border-color: #555;
        }

        .btn-send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .code-area {
          flex: 0 0 45%;
          display: flex;
          flex-direction: column;
          border-left: 1px solid #333;
          background: #0a0a0a;
          overflow: hidden;
        }

        .code-header {
          padding: 16px 20px;
          border-bottom: 1px solid #333;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          font-weight: 600;
        }

        .btn-apply {
          padding: 6px 12px;
          background: #2d5a7b;
          border: 1px solid #4a9eff;
          color: #4a9eff;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }

        .btn-apply:hover:not(:disabled) {
          background: #3d6a8b;
        }

        .btn-apply:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .code-block {
          flex: 1;
          margin: 0;
          padding: 16px;
          background: #1a1a1a;
          overflow-y: auto;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 12px;
          line-height: 1.5;
          color: #e5e5e5;
          border: none;
        }

        .filename {
          font-size: 11px;
          color: #888;
          margin-left: 12px;
          font-weight: normal;
        }

        .diff-container {
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 12px;
          line-height: 1.5;
        }

        .diff-line {
          display: flex;
          align-items: flex-start;
          padding: 2px 0;
          color: #e5e5e5;
        }

        .diff-added {
          background: rgba(16, 185, 129, 0.15);
          color: #86efac;
        }

        .diff-removed {
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
        }

        .diff-context {
          color: #999;
        }

        .diff-line-num {
          display: inline-block;
          width: 40px;
          text-align: right;
          padding-right: 12px;
          color: #666;
          user-select: none;
        }

        .diff-marker {
          display: inline-block;
          width: 20px;
          text-align: center;
          user-select: none;
          font-weight: bold;
        }

        .diff-content {
          flex: 1;
          white-space: pre-wrap;
          word-break: break-word;
        }

        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }

        ::-webkit-scrollbar-thumb {
          background: #444;
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: #555;
        }

        .empty-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #666;
        }

        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 16px;
          color: #444;
          opacity: 0.5;
        }

        .empty-state-text {
          font-size: 16px;
          margin-bottom: 24px;
          color: #888;
        }

        .empty-state-btn {
          padding: 10px 24px;
          background: #2d5a7b;
          border: 1px solid #4a9eff;
          color: #4a9eff;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .empty-state-btn:hover {
          background: #3d6a8b;
        }
      `}</style>
    </div>
  )
}
