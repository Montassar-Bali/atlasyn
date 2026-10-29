import React, {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUpRight,
  Brain,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Database,
  Edit3,
  Globe,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react'

// ── Types ──
export interface ConversationItem {
  id: string
  title: string
  model: string
  created_at?: string
  updated_at?: string
}

export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at?: string
}

export interface MemoryItem {
  id: string
  key: string
  value: string
  category: string
  created_at?: string
}

interface AtlasynCopilotProps {
  open: boolean
  onClose: () => void
  dateRange: string
  onToast: (message: string) => void
}

// ── Markdown Parser & Code Block Renderer ──
function renderFormattedContent(content: string, onCopyCode: (code: string) => void, copiedCode: string | null) {
  if (!content) return null

  // Split by code blocks ```lang ... ```
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index)
    if (textBefore) {
      parts.push(renderTextMarkdown(textBefore, `text-${lastIndex}`))
    }

    const language = match[1] || 'code'
    const codeContent = match[2].trimEnd()
    const blockKey = `code-${match.index}`
    const isCopied = copiedCode === codeContent

    parts.push(
      <div key={blockKey} className="copilot-code-block">
        <div className="copilot-code-header">
          <span className="copilot-code-lang">{language}</span>
          <button
            type="button"
            className="copilot-code-copy-btn"
            onClick={() => onCopyCode(codeContent)}
            title="Copy code to clipboard"
          >
            {isCopied ? (
              <>
                <Check size={13} className="text-emerald-400" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Copy code</span>
              </>
            )}
          </button>
        </div>
        <pre className="copilot-code-pre">
          <code>{codeContent}</code>
        </pre>
      </div>
    )

    lastIndex = match.index + match[0].length
  }

  const remainingText = content.substring(lastIndex)
  if (remainingText) {
    parts.push(renderTextMarkdown(remainingText, `text-end-${lastIndex}`))
  }

  return <>{parts}</>
}

// Format basic markdown: headers, bold, italics, lists, blockquotes, inline backticks
function renderTextMarkdown(text: string, keyPrefix: string): React.ReactNode {
  const lines = text.split('\n')
  return (
    <div key={keyPrefix} className="copilot-markdown-chunk">
      {lines.map((line, idx) => {
        const lineKey = `${keyPrefix}-l-${idx}`

        // Empty line
        if (!line.trim()) {
          return <div key={lineKey} className="copilot-md-gap" />
        }

        // Headers
        if (line.startsWith('### ')) {
          return <h4 key={lineKey} className="copilot-md-h3">{parseInline(line.slice(4))}</h4>
        }
        if (line.startsWith('## ')) {
          return <h3 key={lineKey} className="copilot-md-h2">{parseInline(line.slice(3))}</h3>
        }
        if (line.startsWith('# ')) {
          return <h2 key={lineKey} className="copilot-md-h1">{parseInline(line.slice(2))}</h2>
        }

        // Blockquote
        if (line.startsWith('> ')) {
          return (
            <blockquote key={lineKey} className="copilot-md-quote">
              {parseInline(line.slice(2))}
            </blockquote>
          )
        }

        // Bullet list
        if (line.match(/^[\*\-]\s+/)) {
          return (
            <div key={lineKey} className="copilot-md-bullet">
              <span className="bullet-dot">•</span>
              <span>{parseInline(line.replace(/^[\*\-]\s+/, ''))}</span>
            </div>
          )
        }

        // Numbered list
        const numMatch = line.match(/^(\d+)\.\s+/)
        if (numMatch) {
          return (
            <div key={lineKey} className="copilot-md-numbered">
              <span className="number-label">{numMatch[1]}.</span>
              <span>{parseInline(line.slice(numMatch[0].length))}</span>
            </div>
          )
        }

        // Normal paragraph
        return <p key={lineKey} className="copilot-md-p">{parseInline(line)}</p>
      })}
    </div>
  )
}

function parseInline(str: string): React.ReactNode[] {
  // Regex for inline code `...`, bold **...**, italic *...*
  const tokens: React.ReactNode[] = []
  let rest = str
  let keyIndex = 0

  while (rest.length > 0) {
    // Inline code
    const codeMatch = rest.match(/^`([^`]+)`/)
    if (codeMatch) {
      tokens.push(<code key={`ic-${keyIndex++}`} className="copilot-inline-code">{codeMatch[1]}</code>)
      rest = rest.slice(codeMatch[0].length)
      continue
    }

    // Bold **text**
    const boldMatch = rest.match(/^\*\*([^*]+)\*\*/)
    if (boldMatch) {
      tokens.push(<strong key={`b-${keyIndex++}`} className="copilot-strong">{boldMatch[1]}</strong>)
      rest = rest.slice(boldMatch[0].length)
      continue
    }

    // Italic *text*
    const italicMatch = rest.match(/^\*([^*]+)\*/)
    if (italicMatch) {
      tokens.push(<em key={`it-${keyIndex++}`} className="copilot-em">{italicMatch[1]}</em>)
      rest = rest.slice(italicMatch[0].length)
      continue
    }

    // Plain text up to next special character
    const nextSpecial = rest.search(/[`*]/)
    if (nextSpecial === -1) {
      tokens.push(rest)
      break
    } else if (nextSpecial > 0) {
      tokens.push(rest.slice(0, nextSpecial))
      rest = rest.slice(nextSpecial)
    } else {
      // Just a literal special character with no match
      tokens.push(rest[0])
      rest = rest.slice(1)
    }
  }

  return tokens
}

// ── Main Component ──
export function AtlasynCopilot({ open, onClose, dateRange, onToast }: AtlasynCopilotProps) {
  // Conversations and Messages
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [currentConvId, setCurrentConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        "Hello! I am your **ATLASYN AI Copilot**, running locally with real open-weight intelligence.\n\nI can analyze your business ledger, optimize margins, write and debug software code, solve mathematical models, and answer inquiries in English, French, or Tunisian Arabic.\n\nHow can I help you today?",
    },
  ])

  // UI States
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editInput, setEditInput] = useState('')
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Model & Server Status
  const [activeModel, setActiveModel] = useState<string>('qwen2.5:3b')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [isOllamaOnline, setIsOllamaOnline] = useState<boolean>(true)
  const [modelSelectorOpen, setModelSelectorOpen] = useState<boolean>(false)

  // Memory Management Modal
  const [memoryModalOpen, setMemoryModalOpen] = useState<boolean>(false)
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [newMemKey, setNewMemKey] = useState('')
  const [newMemVal, setNewMemVal] = useState('')

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load Server Health, Models & Conversations on Mount ──
  const refreshHealthAndModels = useCallback(async () => {
    try {
      const res = await fetch('/api/health')
      if (res.ok) {
        const data = await res.json()
        setIsOllamaOnline(data.ollama?.online ?? false)
        if (data.active_model) setActiveModel(data.active_model)
        if (data.ollama?.models) setAvailableModels(data.ollama.models)
      }
    } catch {
      setIsOllamaOnline(false)
    }
  }, [])

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch (e) {
      console.warn('Failed to fetch conversations:', e)
    }
  }, [])

  const loadMemories = useCallback(async () => {
    try {
      const res = await fetch('/api/memories')
      if (res.ok) {
        const data = await res.json()
        setMemories(data.memories || [])
      }
    } catch (e) {
      console.warn('Failed to fetch memories:', e)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void refreshHealthAndModels()
      void loadConversations()
      void loadMemories()
    }
  }, [open, refreshHealthAndModels, loadConversations, loadMemories])

  // ── Auto-scroll detection ──
  const handleScroll = () => {
    if (!scrollContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight)
    setIsAtBottom(distanceToBottom < 60)
  }

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    })
  }

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom(false)
    }
  }, [messages, streamingContent, isAtBottom])

  // ── Load Conversation History ──
  const switchConversation = async (convId: string) => {
    try {
      if (isStreaming && abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const res = await fetch(`/api/conversations/${convId}`)
      if (res.ok) {
        const data = await res.json()
        setCurrentConvId(convId)
        if (data.conversation?.model) {
          setActiveModel(data.conversation.model)
        }
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages)
        } else {
          setMessages([
            {
              role: 'assistant',
              content: `Conversation loaded (${data.conversation?.title || 'Thread'}). How can I assist you?`,
            },
          ])
        }
        setSidebarOpen(false)
        setTimeout(() => scrollToBottom(false), 50)
      }
    } catch {
      onToast('Failed to switch conversation.')
    }
  }

  const startNewConversation = () => {
    if (isStreaming && abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setCurrentConvId(null)
    setMessages([
      {
        role: 'assistant',
        content:
          "Starting a fresh conversation thread with **ATLASYN AI Copilot**.\n\nAll earlier turns in other threads remain securely stored. What would you like to explore next?",
      },
    ])
    setSidebarOpen(false)
  }

  const deleteConv = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/conversations/${convId}`, { method: 'DELETE' })
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId))
        if (currentConvId === convId) {
          startNewConversation()
        }
        onToast('Conversation deleted.')
      }
    } catch {
      onToast('Failed to delete conversation.')
    }
  }

  // ── Streaming Message Submission ──
  const sendMessage = async (promptText: string, overrideConvId?: string) => {
    const text = promptText.trim()
    if (!text || isStreaming) return

    // Add user message to UI immediately
    const userMsg: ChatMessage = { role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setIsStreaming(true)
    setStreamingContent('')

    const targetConvId = overrideConvId ?? currentConvId

    // Abort controller for cancellation
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: targetConvId,
          message: text,
          model: activeModel,
          temperature: 0.7,
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`Server responded with ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let accumulatedAssistantTokens = ''
      let resolvedConvId = targetConvId

      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = 'message'
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim()
            continue
          }

          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim()
            try {
              const data = JSON.parse(jsonStr)

              if (currentEvent === 'meta') {
                if (data.conversation_id && !currentConvId) {
                  resolvedConvId = data.conversation_id
                  setCurrentConvId(data.conversation_id)
                }
              } else if (currentEvent === 'token') {
                accumulatedAssistantTokens += data.token || ''
                setStreamingContent(accumulatedAssistantTokens)
              } else if (currentEvent === 'done') {
                if (data.conversation_id) {
                  resolvedConvId = data.conversation_id
                  setCurrentConvId(data.conversation_id)
                }
                // Refresh conversations list to show updated title
                void loadConversations()
              } else if (currentEvent === 'error') {
                accumulatedAssistantTokens += `\n\n*(Error: ${data.error || 'Inference error'})*`
                setStreamingContent(accumulatedAssistantTokens)
              }
            } catch {
              // Non-JSON line fallback
            }
          }
        }
      }

      // Commit finalized message to state
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: accumulatedAssistantTokens || 'No response generated.',
        },
      ])
      setStreamingContent('')
      setIsStreaming(false)
      abortControllerRef.current = null
      void loadConversations()
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User clicked "Stop Generating"
        if (streamingContent) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: streamingContent + ' *(Generation stopped by user)*',
            },
          ])
        }
        onToast('Generation stopped.')
      } else {
        console.error('Chat stream error:', err)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `⚠️ **Unable to complete response.**\n\nEnsure Ollama is running locally (\`ollama serve\`) and model \`${activeModel}\` is downloaded.\n\n*Technical detail: ${err.message || String(err)}*`,
          },
        ])
        onToast('Error communicating with local AI model.')
      }
      setStreamingContent('')
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }

  // ── Stop Generation ──
  const stopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  // ── Regenerate Response ──
  const regenerateLast = () => {
    if (isStreaming || messages.length < 2) return
    // Find the last user message
    let lastUserIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex === -1) return
    const lastUserPrompt = messages[lastUserIndex].content
    // Remove everything from that user message forward and resubmit
    setMessages((prev) => prev.slice(0, lastUserIndex))
    void sendMessage(lastUserPrompt)
  }

  // ── Edit & Resend Message ──
  const handleStartEdit = (index: number) => {
    setEditingIndex(index)
    setEditInput(messages[index].content)
  }

  const handleSaveEdit = (index: number) => {
    const newText = editInput.trim()
    if (!newText) return
    setEditingIndex(null)
    // Slice off all messages after this one, replace user message, and submit
    setMessages((prev) => prev.slice(0, index))
    void sendMessage(newText)
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setEditInput('')
  }

  // ── Form Submission ──
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    void sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isStreaming) {
        void sendMessage(input)
      }
    }
  }

  // ── Copy Utilities ──
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCode(text)
      onToast('Code copied to clipboard.')
      setTimeout(() => setCopiedCode(null), 2000)
    } catch {
      onToast('Failed to copy to clipboard.')
    }
  }

  // ── Memory Management Actions ──
  const handleSaveMemory = async (e: FormEvent) => {
    e.preventDefault()
    if (!newMemKey.trim() || !newMemVal.trim()) return
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newMemKey.trim(),
          value: newMemVal.trim(),
          category: 'user_preference',
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setMemories((prev) => [created, ...prev])
        setNewMemKey('')
        setNewMemVal('')
        onToast('Memory stored permanently.')
      }
    } catch {
      onToast('Failed to save memory.')
    }
  }

  const handleDeleteMemory = async (memId: string) => {
    try {
      const res = await fetch(`/api/memories/${memId}`, { method: 'DELETE' })
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== memId))
        onToast('Memory deleted.')
      }
    } catch {
      onToast('Failed to delete memory.')
    }
  }

  // Model selection
  const handleSelectModel = async (modelName: string) => {
    try {
      const res = await fetch('/api/models/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      })
      if (res.ok) {
        setActiveModel(modelName)
        setModelSelectorOpen(false)
        onToast(`Active model switched to ${modelName}`)
      }
    } catch {
      onToast('Failed to switch model.')
    }
  }

  if (!open) return null

  return (
    <div className="copilot-layer open">
      <button className="copilot-backdrop" onClick={onClose} aria-label="Close AI Copilot" />

      <aside className="atlasyn-copilot-panel" role="dialog" aria-modal="true" aria-labelledby="copilot-panel-title">
        {/* ── Left Sidebar (Conversation History) ── */}
        <div className={`copilot-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="copilot-sidebar-header">
            <button className="copilot-new-chat-btn" onClick={startNewConversation}>
              <Plus size={15} />
              <span>New Chat</span>
            </button>
            <button
              className="copilot-sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close History"
            >
              <X size={16} />
            </button>
          </div>

          <div className="copilot-conv-list">
            <div className="copilot-conv-section-title">Previous Conversations</div>
            {conversations.length === 0 ? (
              <div className="copilot-conv-empty">No conversations yet.</div>
            ) : (
              conversations.map((c) => {
                const isActive = c.id === currentConvId
                return (
                  <div
                    key={c.id}
                    className={`copilot-conv-item ${isActive ? 'active' : ''}`}
                    onClick={() => switchConversation(c.id)}
                  >
                    <MessageSquare size={14} className="conv-icon" />
                    <span className="conv-title">{c.title || 'Untitled Chat'}</span>
                    <button
                      className="conv-delete-btn"
                      onClick={(e) => deleteConv(e, c.id)}
                      title="Delete conversation"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Model Status Beacon at bottom of sidebar */}
          <div className="copilot-sidebar-footer">
            <div className="copilot-ollama-status">
              <span className={`status-indicator ${isOllamaOnline ? 'online' : 'offline'}`} />
              <div className="status-text">
                <strong>{isOllamaOnline ? 'Ollama Online' : 'Ollama Offline'}</strong>
                <span>{activeModel} (Local LLM)</span>
              </div>
            </div>
            <button
              className="copilot-memory-open-btn"
              onClick={() => setMemoryModalOpen(true)}
              title="Manage Long-term Memory"
            >
              <Brain size={14} />
              <span>Memory ({memories.length})</span>
            </button>
          </div>
        </div>

        {/* ── Main Chat Area ── */}
        <div className="copilot-main">
          {/* Top Navigation Bar */}
          <header className="copilot-header">
            <div className="header-left">
              <button
                className="copilot-history-toggle"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                title="Toggle Conversation History"
              >
                <MessageSquare size={16} />
                <span>History</span>
              </button>

              <div className="model-selector-container">
                <button
                  type="button"
                  className="model-pill"
                  onClick={() => setModelSelectorOpen(!modelSelectorOpen)}
                  title="Switch Local AI Model"
                >
                  <Cpu size={14} className="text-teal-400" />
                  <span className="model-name">{activeModel}</span>
                  <ChevronDown size={12} />
                </button>

                {modelSelectorOpen && (
                  <div className="model-dropdown-menu">
                    <div className="model-dropdown-header">Select Open-Weight Model</div>
                    {availableModels.length > 0 ? (
                      availableModels.map((m) => (
                        <button
                          key={m}
                          className={`model-option ${m === activeModel ? 'active' : ''}`}
                          onClick={() => handleSelectModel(m)}
                        >
                          <Cpu size={13} />
                          <span>{m}</span>
                          {m === activeModel && <Check size={13} className="check-icon" />}
                        </button>
                      ))
                    ) : (
                      <div className="model-option active">
                        <Cpu size={13} />
                        <span>{activeModel} (Default)</span>
                      </div>
                    )}
                    <div className="model-dropdown-note">
                      100% Private local inference via Ollama. No OpenAI keys or external cloud dependencies.
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="header-right">
              <button
                type="button"
                className="header-action-btn"
                onClick={() => setMemoryModalOpen(true)}
                title="Long-Term Semantic Memory"
              >
                <Brain size={15} />
                <span className="hide-mobile">Memories</span>
              </button>
              <button
                type="button"
                className="header-action-btn"
                onClick={startNewConversation}
                title="Start a new chat"
              >
                <Plus size={16} />
                <span className="hide-mobile">New</span>
              </button>
              <button
                type="button"
                className="header-close-btn"
                onClick={onClose}
                aria-label="Close Assistant"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          {/* Model Status Warning Banner if Offline */}
          {!isOllamaOnline && (
            <div className="copilot-offline-banner">
              <AlertCircle size={15} />
              <span>
                Ollama local server is not reachable on port 11434. Start it with <code>ollama serve</code> in your terminal.
              </span>
              <button onClick={() => void refreshHealthAndModels()} title="Retry connection">
                <RefreshCw size={13} />
              </button>
            </div>
          )}

          {/* Message Thread */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="copilot-scroll-container"
            aria-live="polite"
          >
            <div className="copilot-thread-inner">
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user'
                const isEditing = editingIndex === index

                if (isUser) {
                  return (
                    <div key={index} className="copilot-turn user-turn">
                      <div className="turn-avatar user-avatar">You</div>
                      <div className="turn-body">
                        {isEditing ? (
                          <div className="edit-message-box">
                            <textarea
                              value={editInput}
                              onChange={(e) => setEditInput(e.target.value)}
                              rows={3}
                              className="edit-textarea"
                            />
                            <div className="edit-actions">
                              <button
                                className="edit-btn save"
                                onClick={() => handleSaveEdit(index)}
                              >
                                Save & Submit
                              </button>
                              <button
                                className="edit-btn cancel"
                                onClick={handleCancelEdit}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="user-message-bubble">
                            <p>{msg.content}</p>
                            <button
                              className="edit-msg-trigger"
                              onClick={() => handleStartEdit(index)}
                              title="Edit and resend"
                            >
                              <Edit3 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }

                // Assistant turn
                const isLastAssistant =
                  index === messages.length - 1 ||
                  (index === messages.length - 2 && messages[index + 1].role === 'user')

                return (
                  <div key={index} className="copilot-turn assistant-turn">
                    <div className="turn-avatar ai-avatar">
                      <Sparkles size={16} />
                    </div>
                    <div className="turn-body">
                      <div className="assistant-message-content">
                        {renderFormattedContent(msg.content, copyToClipboard, copiedCode)}
                      </div>
                      <div className="assistant-turn-actions">
                        <button
                          type="button"
                          className="turn-action-btn"
                          onClick={() => copyToClipboard(msg.content)}
                          title="Copy entire response"
                        >
                          <Copy size={13} />
                          <span>Copy</span>
                        </button>
                        {isLastAssistant && !isStreaming && (
                          <button
                            type="button"
                            className="turn-action-btn"
                            onClick={regenerateLast}
                            title="Regenerate this response"
                          >
                            <RotateCcw size={13} />
                            <span>Regenerate</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Live Streaming Response Card */}
              {isStreaming && (
                <div className="copilot-turn assistant-turn streaming-active">
                  <div className="turn-avatar ai-avatar pulsing">
                    <Sparkles size={16} />
                  </div>
                  <div className="turn-body">
                    <div className="assistant-message-content">
                      {streamingContent ? (
                        <>
                          {renderFormattedContent(streamingContent, copyToClipboard, copiedCode)}
                          <span className="streaming-cursor" />
                        </>
                      ) : (
                        <div className="copilot-thinking-indicator">
                          <span className="thinking-dot" />
                          <span className="thinking-dot" />
                          <span className="thinking-dot" />
                          <span className="thinking-label">Reasoning with {activeModel}…</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Starter Suggestions when thread is clean */}
              {messages.length === 1 && !isStreaming && (
                <div className="copilot-suggested-prompts">
                  <div className="suggestions-title">
                    <Sparkles size={14} className="text-amber-400" />
                    <span>Suggested prompts & capabilities</span>
                  </div>
                  <div className="suggestions-grid">
                    <button
                      type="button"
                      className="suggestion-chip"
                      onClick={() =>
                        sendMessage('Why did our operating profit decline, and what are 3 concrete corrective steps?')
                      }
                    >
                      <div className="chip-badge">Finance & Ops</div>
                      <strong>Analyze Profit Decline</strong>
                      <span>Investigate operating costs vs revenue margins.</span>
                    </button>

                    <button
                      type="button"
                      className="suggestion-chip"
                      onClick={() =>
                        sendMessage(
                          'Write a thread-safe Python memory caching class with TTL and LRU eviction policy. Include docstrings and an example.'
                        )
                      }
                    >
                      <div className="chip-badge">Engineering</div>
                      <strong>Python LRU Cache</strong>
                      <span>Generate robust, production-quality code.</span>
                    </button>

                    <button
                      type="button"
                      className="suggestion-chip"
                      onClick={() =>
                        sendMessage(
                          'Donne-moi une analyse concise des opportunités de distribution en Tunisie en français et en arabe تونسي.'
                        )
                      }
                    >
                      <div className="chip-badge">Multilingue</div>
                      <strong>Analyse Tunisie (FR & AR)</strong>
                      <span>Compréhension bilingue et dialecte tunisien.</span>
                    </button>

                    <button
                      type="button"
                      className="suggestion-chip"
                      onClick={() =>
                        sendMessage(
                          'Calculate the break-even volume if fixed costs are 45,000 TND, unit sale is 120 TND, and variable cost is 68 TND.'
                        )
                      }
                    >
                      <div className="chip-badge">Math & Logic</div>
                      <strong>Break-Even Model</strong>
                      <span>Step-by-step mathematical reasoning.</span>
                    </button>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Floating Scroll to Bottom Button */}
          {!isAtBottom && (
            <button
              type="button"
              className="copilot-scroll-bottom-btn"
              onClick={() => scrollToBottom(true)}
              title="Scroll to latest message"
            >
              <ArrowDown size={15} />
            </button>
          )}

          {/* Composer / Input Area */}
          <div className="copilot-composer-container">
            {isStreaming && (
              <div className="copilot-stop-banner">
                <button
                  type="button"
                  className="copilot-stop-btn"
                  onClick={stopGenerating}
                >
                  <Square size={13} className="fill-current" />
                  <span>Stop generating</span>
                </button>
              </div>
            )}

            <form className="copilot-composer-form" onSubmit={handleSubmit}>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    onToast(`Document "${file.name}" staged for context injection.`)
                  }
                }}
              />

              <div className="composer-input-row">
                <button
                  type="button"
                  className="composer-attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach reference document"
                >
                  <Paperclip size={17} />
                </button>

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask ATLASYN AI anything (code, business logic, math, multilingual)..."
                  rows={1}
                  className="composer-textarea"
                />

                <button
                  type="submit"
                  disabled={!input.trim() || isStreaming}
                  className="composer-send-btn"
                  aria-label="Send message"
                >
                  <Send size={15} />
                </button>
              </div>

              <div className="composer-footer-note">
                <span>Model: <strong>{activeModel}</strong></span>
                <span>•</span>
                <span>Zero OpenAI API</span>
                <span>•</span>
                <span>100% Private local weights</span>
              </div>
            </form>
          </div>
        </div>

        {/* ── Memory Management Modal ── */}
        {memoryModalOpen && (
          <div className="copilot-modal-backdrop" onClick={() => setMemoryModalOpen(false)}>
            <div className="copilot-memory-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title-row">
                  <Brain size={18} className="text-teal-400" />
                  <h3>Long-Term Semantic Memory</h3>
                </div>
                <button
                  className="modal-close-btn"
                  onClick={() => setMemoryModalOpen(false)}
                >
                  <X size={17} />
                </button>
              </div>

              <p className="modal-desc">
                Stored memories are automatically injected into relevant prompts by the local LLM. You have full transparency and control to inspect, add, or delete any memory.
              </p>

              {/* Add Memory Form */}
              <form className="modal-add-form" onSubmit={handleSaveMemory}>
                <div className="form-inputs">
                  <input
                    type="text"
                    placeholder="Memory Key (e.g. Preferred Language, Fiscal Target)"
                    value={newMemKey}
                    onChange={(e) => setNewMemKey(e.target.value)}
                    className="modal-input"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Memory Value (e.g. Always answer in French, Target margin 28%)"
                    value={newMemVal}
                    onChange={(e) => setNewMemVal(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <button type="submit" className="modal-add-btn">
                  <Plus size={14} />
                  <span>Store Memory</span>
                </button>
              </form>

              {/* Memory List */}
              <div className="modal-memory-list">
                {memories.length === 0 ? (
                  <div className="modal-memory-empty">
                    No memories saved yet. Memories added here or learned in conversations will appear for your review.
                  </div>
                ) : (
                  memories.map((m) => (
                    <div key={m.id} className="modal-memory-item">
                      <div className="memory-details">
                        <strong className="memory-key">{m.key}</strong>
                        <p className="memory-val">{m.value}</p>
                        <span className="memory-tag">{m.category}</span>
                      </div>
                      <button
                        className="memory-del-btn"
                        onClick={() => handleDeleteMemory(m.id)}
                        title="Delete memory"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
