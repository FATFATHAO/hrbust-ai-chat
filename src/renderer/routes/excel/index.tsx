import '@mantine/dropzone/styles.css'
import { ActionIcon, Box, Button, Checkbox, Flex, Menu, Modal, Paper, ScrollArea, Stack, Text, TextInput, Table } from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { IconChevronDown, IconFileSpreadsheet, IconHistory, IconLoader2, IconPlus, IconTableShortcut, IconTrash, IconUpload, IconX } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChartRenderer } from '@/components/excel/ChartRenderer'
import Markdown from '@/components/Markdown'
import Page from '@/components/layout/Page'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { useUIStore } from '@/stores/uiStore'

export const Route = createFileRoute('/excel/')({
  component: ExcelPage,
})

interface TableInfo {
  id: string
  filename: string
  sheet_name: string
  all_sheets?: string[]  // 所有工作表名称
  total_rows: number
  total_columns: number
  is_active: boolean
  is_joined: boolean
  source_tables?: string[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  tableId?: string
  tableName?: string
  toolCalls?: ToolCall[]  // 关联到每条消息的工具调用
}

interface ToolCall {
  name: string
  args: Record<string, unknown>
  result?: unknown
  hasChart?: boolean
  chartConfig?: Record<string, unknown>
  chartMessage?: string
}

interface StreamEvent {
  type:
    | 'thinking'
    | 'thinking_done'
    | 'clear_thinking'
    | 'tool_call'
    | 'tool_result'
    | 'token'
    | 'done'
    | 'table_info'
    | 'error'
    | 'cancelled'
  content?: string
  name?: string
  args?: Record<string, unknown>
  result?: unknown
  table_id?: string
}

// API Base URL - configurable
const API_BASE = import.meta.env.VITE_EXCEL_API_URL || 'http://localhost:48000'

// Session ID key for localStorage
const SESSION_ID_KEY = 'excel_session_id'
const LAST_SESSION_KEY = 'excel_last_session_id'

// Generate a session ID
const generateSessionId = () => `sess_${Math.random().toString(36).substring(2, 15)}`

// Get or create session ID from localStorage
const getSessionId = (): string => {
  let sessionId = localStorage.getItem(SESSION_ID_KEY)
  if (!sessionId) {
    sessionId = generateSessionId()
    localStorage.setItem(SESSION_ID_KEY, sessionId)
  }
  return sessionId
}

// API fetch helper with session header
const apiFetch = async (url: string, options: RequestInit = {}, currentSessionId?: string) => {
  const headers: HeadersInit = {
    ...(options.headers || {}),
  }

  // Add session ID header
  const sid = currentSessionId || getSessionId()
  if (sid) {
    (headers as Record<string, string>)['X-Session-ID'] = sid
  }

  return fetch(url, {
    ...options,
    headers,
  })
}

// Knowledge base stats interface
interface KnowledgeStats {
  total_entries: number
  vector_db_path: string
  embedding_model: string
}

function ExcelPage() {
  const { t } = useTranslation()
  const isSmallScreen = useIsSmallScreen()

  // State
  const [tables, setTables] = useState<TableInfo[]>([])
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)

  // Thinking block state (per message)
  const [currentThinking, setCurrentThinking] = useState<string | null>(null)
  const [thinkingFinished, setThinkingFinished] = useState(false)

  // Tool calls state (per message)
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCall[]>([])

  // Knowledge base state
  const [kbStats, setKbStats] = useState<KnowledgeStats | null>(null)
  const [kbInitializing, setKbInitializing] = useState(false)

  // Sheet selection state
  const [pendingSheets, setPendingSheets] = useState<{
    filename: string
    allSheets: string[]
    file: File
    preloadedTables?: TableInfo[]
    preloadedTableId?: string
  } | null>(null)
  const [sheetSelectModalOpen, setSheetSelectModalOpen] = useState(false)

  // Delete selection state
  const [deleteSelectModalOpen, setDeleteSelectModalOpen] = useState(false)
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([])

  // History sessions state
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historySessions, setHistorySessions] = useState<Array<{
    session_id: string
    created_at: string
    last_accessed: string
    file_count: number
    has_history: boolean
    message_count: number
  }>>([])

  // Refs
  const scrollViewportRef = useRef<HTMLDivElement>(null)  // 滚动viewport的ref
  const currentStreamingMsgIdRef = useRef<string | null>(null)  // 跟踪当前正在流式传输的消息 ID
  const currentReaderRef = useRef<ReadableStreamDefaultReader | null>(null)  // 用于取消请求
  const messagesRef = useRef<ChatMessage[]>([])  // 用于保存历史，确保访问最新值
  const sessionIdRef = useRef<string>(getSessionId())  // 当前 session ID 的 ref，确保 saveHistory 使用正确值
  const saveInProgressRef = useRef<Promise<void> | null>(null)  // 追踪正在进行的保存操作
  const hasLeftBottomRef = useRef(false)  // 追踪用户是否已离开底部（向上滚动后）

  // Session ID
  const [sessionId, setSessionId] = useState<string>(getSessionId)

  const showSidebar = useUIStore((s) => s.showSidebar)
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)

  // Active table
  const activeTable = tables.find((t) => t.id === activeTableId)

  // Auto-scroll state (当用户在底部附近时自动滚动)
  const [autoScroll, setAutoScroll] = useState(true)
  const [hasLeftBottom, setHasLeftBottom] = useState(false)  // 用户是否已离开底部

  // 历史记录加载状态 - 必须等待历史加载完成才能发消息，防止刷新后消息被覆盖
  const [historyLoaded, setHistoryLoaded] = useState(false)

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (autoScroll && scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight
    }
  }, [autoScroll])

  // 当消息变化时自动滚动（仅在自动滚动开启时）
  useEffect(() => {
    if (autoScroll) {
      scrollToBottom()
    }
  }, [messages, currentThinking, currentToolCalls, scrollToBottom, autoScroll])

  // 设置滚动监听器
  useEffect(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight

      // 如果用户已离开底部，需要主动滑回底部才能重新启用
      if (hasLeftBottomRef.current) {
        if (distanceFromBottom < 50) {
          // 用户主动滑回底部，重新启用自动跟随
          hasLeftBottomRef.current = false
          setHasLeftBottom(false)
          setAutoScroll(true)
        }
        // 否则保持禁用状态
        return
      }

      // 正常状态：检查是否需要启用或禁用
      if (distanceFromBottom < 100) {
        // 在底部附近，启用自动跟随
        setAutoScroll(true)
      } else if (distanceFromBottom > 150) {
        // 用户向上滚动离开底部，禁用自动跟随
        hasLeftBottomRef.current = true
        setHasLeftBottom(true)
        setAutoScroll(false)
      }
    }

    viewport.addEventListener('scroll', handleScroll)
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [])

  // Fetch tables on mount
  useEffect(() => {
    fetchTables()
    initKnowledgeBase()
    loadHistory()
  }, [])

  // Load history when session changes
  useEffect(() => {
    if (sessionId) {
      loadHistory()
    }
  }, [sessionId])

  // 同步 messages 到 ref，确保 saveHistory 访问最新值
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Load history messages
  const loadHistory = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/session/history`)
      if (res.ok) {
        const data = await res.json()
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages)
          // 同步到 ref，确保后续 saveHistory 使用正确的数据
          messagesRef.current = data.messages
        }
      }
    } catch (e) {
      console.error('Load history failed:', e)
    } finally {
      // 无论成功失败，都要标记为已加载，防止刷新后输入被允许而覆盖历史
      setHistoryLoaded(true)
    }
  }

  // Save history messages
  const saveHistory = async () => {
    // 使用 ref 确保获取最新消息状态
    const currentMessages = messagesRef.current
    const currentSessionId = sessionIdRef.current
    if (currentMessages.length === 0) return

    // 追踪保存操作
    const savePromise = (async () => {
      try {
        await apiFetch(`${API_BASE}/session/history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: currentMessages }),
        })
      } catch (e) {
        console.error('Save history failed:', e)
      }
    })()

    saveInProgressRef.current = savePromise
    await savePromise
    saveInProgressRef.current = null
  }

  // Fetch sessions list
  const fetchSessionsList = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/sessions`)
      if (res.ok) {
        const data = await res.json()
        setHistorySessions(data.sessions || [])
      }
    } catch (e) {
      console.error('Fetch sessions failed:', e)
    }
  }

  // Load a specific session
  const loadSession = async (targetSessionId: string) => {
    try {
      // Wait for any in-progress save to complete first
      if (saveInProgressRef.current) {
        await saveInProgressRef.current
      }

      // Update localStorage and refs FIRST
      localStorage.setItem(SESSION_ID_KEY, targetSessionId)
      sessionIdRef.current = targetSessionId
      setSessionId(targetSessionId)

      // 切换会话时重置历史加载状态，防止新历史未加载完就输入
      setHistoryLoaded(false)

      // Clear messages immediately to prevent stale data
      messagesRef.current = []
      setMessages([])

      // 调用后端加载该 session 的状态（文件列表和活跃表）
      const loadRes = await apiFetch(`${API_BASE}/session/${targetSessionId}/load`, { method: 'POST' })
      if (loadRes.ok) {
        const loadData = await loadRes.json()
        setTables(loadData.tables || [])
        setActiveTableId(loadData.active_table_id || null)
      }

      // Fetch history for this session
      const historyRes = await apiFetch(`${API_BASE}/session/history`)
      if (historyRes.ok) {
        const historyData = await historyRes.json()
        const loadedMessages = historyData.messages || []
        setMessages(loadedMessages)
        messagesRef.current = loadedMessages
      }

      setHistoryModalOpen(false)
    } catch (e) {
      console.error('Load session failed:', e)
    } finally {
      setHistoryLoaded(true)
    }
  }

  // Delete a session
  const deleteSession = async (targetSessionId: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/sessions/${targetSessionId}`, { method: 'DELETE' })
      if (res.ok) {
        // Remove from local list
        setHistorySessions(historySessions.filter(s => s.session_id !== targetSessionId))
        // If deleting current session, create new one
        if (targetSessionId === sessionId) {
          const newSessionId = generateSessionId()
          localStorage.setItem(SESSION_ID_KEY, newSessionId)
          setSessionId(newSessionId)
          setTables([])
          setMessages([])
        }
      }
    } catch (e) {
      console.error('Delete session failed:', e)
    }
  }

  const fetchTables = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/status`)
      const data = await res.json()
      if (data.tables) {
        setTables(data.tables)
        const active = data.tables.find((t: TableInfo) => t.is_active)
        if (active) setActiveTableId(active.id)
      }
    } catch {
      // API not available
    }
  }

  // Initialize knowledge base - index knowledge files
  const initKnowledgeBase = async () => {
    try {
      // First check current stats
      const statsRes = await apiFetch(`${API_BASE}/knowledge/stats`)
      if (statsRes.ok) {
        const stats = await statsRes.json()
        setKbStats(stats)
        // If no entries, trigger indexing
        if (stats.total_entries === 0) {
          setKbInitializing(true)
          const indexRes = await apiFetch(`${API_BASE}/knowledge/index`, { method: 'POST' })
          if (indexRes.ok) {
            const indexResult = await indexRes.json()
            console.log('[知识库] 索引完成:', indexResult)
            // Refresh stats
            const newStatsRes = await apiFetch(`${API_BASE}/knowledge/stats`)
            if (newStatsRes.ok) {
              setKbStats(await newStatsRes.json())
            }
          }
          setKbInitializing(false)
        }
      }
    } catch (e) {
      console.error('[知识库] 初始化失败:', e)
    }
  }

  const handleFileUpload = async (files: File[]) => {
    const validFiles = files.filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase()
      return ['.xlsx', '.xls', '.xlsm'].includes(ext || '')
    })

    if (validFiles.length === 0) return

    setUploadLoading(true)
    for (const file of validFiles) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await apiFetch(`${API_BASE}/upload`, { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()

          // 如果有多个工作表，弹出选择框（先不添加到列表）
          const allSheets = data.structure?.all_sheets || []
          if (allSheets.length > 1) {
            // 暂存数据，等用户选择后再添加
            setPendingSheets({ filename: file.name, allSheets, file, preloadedTables: data.tables, preloadedTableId: data.table_id })
            setSheetSelectModalOpen(true)
          } else {
            // 单工作表直接添加
            if (data.tables) setTables(data.tables)
            if (data.table_id) setActiveTableId(data.table_id)
          }
        }
      } catch (e) {
        console.error('Upload failed:', e)
      }
    }
    setUploadLoading(false)
  }

  // 加载指定工作表
  const handleLoadSheet = async (sheetName: string, isFirstSheet: boolean = false) => {
    if (!pendingSheets) return

    setSheetSelectModalOpen(false)

    // 如果选择的是第一个工作表且已有预加载数据，直接使用
    if (isFirstSheet && pendingSheets.preloadedTables && pendingSheets.preloadedTableId) {
      setTables(pendingSheets.preloadedTables)
      setActiveTableId(pendingSheets.preloadedTableId)
      setPendingSheets(null)
      return
    }

    // 选择非第一个工作表时，使用 switch_sheet 切换到对应表（避免重复上传添加新表）
    setUploadLoading(true)
    try {
      const tableId = pendingSheets.preloadedTableId
      const res = await apiFetch(`${API_BASE}/tables/${tableId}/switch-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet_name: sheetName }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.tables) setTables(data.tables)
        if (data.table_id) setActiveTableId(data.table_id)
      }
    } catch (e) {
      console.error('Load sheet failed:', e)
    }
    setUploadLoading(false)
    setPendingSheets(null)
  }

  const handleDeleteTable = async (tableId: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/tables/${tableId}`, { method: 'DELETE' })
      if (res.ok) {
        const data = await res.json()
        setTables(data.tables || [])
        if (activeTableId === tableId) {
          setActiveTableId(data.active_table_id || null)
        }
      }
    } catch (e) {
      console.error('Delete failed:', e)
    }
  }

  // 删除选中的表格
  const handleDeleteSelectedTables = async () => {
    try {
      for (const tableId of selectedDeleteIds) {
        await apiFetch(`${API_BASE}/tables/${tableId}`, { method: 'DELETE' })
      }
      const res = await apiFetch(`${API_BASE}/status`)
      if (res.ok) {
        const data = await res.json()
        setTables(data.tables || [])
        setActiveTableId(data.tables?.find((t: TableInfo) => t.is_active)?.id || null)
      }
      setSelectedDeleteIds([])
      setDeleteSelectModalOpen(false)
    } catch (e) {
      console.error('Delete selected tables failed:', e)
    }
  }

  // 删除所有表格（重置 session）
  const handleDeleteAllTables = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/session/reset`, { method: 'POST' })
      if (res.ok) {
        setTables([])
        setActiveTableId(null)
        setMessages([])
      }
    } catch (e) {
      console.error('Delete all tables failed:', e)
    }
  }

  // 开启全新对话（创建新 session）
  const handleNewConversation = async () => {
    // 创建新 session，实现真正的全新对话
    const newSessionId = generateSessionId()
    localStorage.setItem(SESSION_ID_KEY, newSessionId)
    sessionIdRef.current = newSessionId
    setSessionId(newSessionId)

    // 重置历史加载状态，等新 session 的历史（空）加载完后再解锁输入
    setHistoryLoaded(false)

    // 清空对话和文件列表
    setMessages([])
    setTables([])
    setActiveTableId(null)
    setCurrentThinking(null)
    setThinkingFinished(false)
    setCurrentToolCalls([])
    setInputValue('')

    // 调用后端 reset 清除 loader，避免历史文件被拉取到新 session
    try {
      await apiFetch(`${API_BASE}/reset`, { method: 'POST' })
    } catch (e) {
      console.error('Reset backend failed:', e)
    }

    // 加载新 session 的历史（新 session 没有历史，会直接解锁输入）
    loadHistory()
  }

  const handleSwitchSheet = async (tableId: string, sheetName: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/tables/${tableId}/switch-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet_name: sheetName }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.tables) {
          setTables(data.tables)
          // 确保 activeTableId 正确指向切换后的表
          const updatedTable = data.tables.find((t: TableInfo) => t.id === tableId)
          if (updatedTable) {
            setActiveTableId(tableId)
          }
        }
        // 切换后清空当前对话，因为数据已变化
        setMessages([])
        setCurrentToolCalls([])
      }
    } catch (e) {
      console.error('Switch sheet failed:', e)
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isProcessing || !activeTableId) return

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      tableId: activeTableId,
      tableName: activeTable?.filename,
    }

    const assistantMsgId = `a-${Date.now()}`
    const placeholderAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
    }

    // 核心修正：必须立刻添加助手占位符，否则后续 map 找不到 ID
    setMessages((prev) => [...prev, userMessage, placeholderAssistantMessage])
    // 同步更新 messagesRef，确保后续使用正确的值
    messagesRef.current = [...messagesRef.current, userMessage, placeholderAssistantMessage]
    setInputValue('')
    setIsProcessing(true)
    setCurrentThinking(null)
    setThinkingFinished(false)
    setCurrentToolCalls([])
    currentStreamingMsgIdRef.current = assistantMsgId

    // 使用 ref 获取最新消息作为 history
    const currentMessages = messagesRef.current

    try {
      const res = await apiFetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          history: currentMessages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
            tableName: m.tableName || '',
          })),
        }),
      })

      const reader = res.body?.getReader()
      currentReaderRef.current = reader
      const decoder = new TextDecoder()

      if (reader) {
        let accumulatedBuffer = '' // 使用独立的累加器

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          accumulatedBuffer += decoder.decode(value, { stream: true })

          // 按行切割，不依赖 \n\n，只依赖 \n
          const lines = accumulatedBuffer.split('\n')

          // 保留最后一行（可能是不完整的包），放回累加器
          accumulatedBuffer = lines.pop() || ''

          for (const line of lines) {
            const trimmedLine = line.trim()
            if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue

            const jsonStr = trimmedLine.slice(6)
            try {
              const event: StreamEvent = JSON.parse(jsonStr)
              // 不使用 await，防止 React 渲染引擎卡死
              handleStreamEvent(event, assistantMsgId)
            } catch (e) {
              // 如果解析失败，说明这个包可能真的碎了，记录但不要卡死循环
              console.warn('[SSE解析跳过]', jsonStr)
            }
          }
        }
      }
    } catch (e) {
      console.error('网络请求失败:', e)
    } finally {
      setIsProcessing(false)
      setThinkingFinished(true)
      // 保存历史消息
      saveHistory()
      // 清理 reader
      if (currentReaderRef.current) {
        currentReaderRef.current.releaseLock()
        currentReaderRef.current = null
      }
    }
  }

  // 取消当前正在进行的流式对话
  const cancelChat = async () => {
    if (currentReaderRef.current) {
      currentReaderRef.current.cancel()
      currentReaderRef.current.releaseLock()
      currentReaderRef.current = null
    }
    try {
      await apiFetch(`${API_BASE}/chat/cancel`, { method: 'POST' })
    } catch (e) {
      console.error('Cancel request failed:', e)
    }
    setIsProcessing(false)
    setThinkingFinished(true)
    setCurrentThinking(null)
  }

  const handleStreamEvent = async (event: StreamEvent, msgId: string) => {
    switch (event.type) {
      case 'thinking':
        setCurrentThinking((prev) => (prev || '') + (event.content || ''))
        break
      case 'thinking_done':
        setThinkingFinished(true)
        break
      case 'clear_thinking':
        setCurrentThinking(null)
        setThinkingFinished(false)
        break
      case 'tool_call':
        setThinkingFinished(true)
        // 更新全局状态（用于流式传输中的实时显示）
        setCurrentToolCalls((prev) => [...prev, { name: event.name || '', args: event.args || {} }])
        // 同时更新消息自身的 toolCalls（用于历史记录持久化）
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== msgId) return m
            const toolCalls = [...(m.toolCalls || []), { name: event.name || '', args: event.args || {} }]
            return { ...m, toolCalls }
          })
        )
        break
      case 'tool_result':
        // 更新全局状态（用于流式传输中的实时显示）
        setCurrentToolCalls((prev) => {
          if (prev.length === 0) return prev
          const updated = [...prev]
          const lastIndex = updated.length - 1
          updated[lastIndex] = { ...updated[lastIndex], result: event.result }
          return updated
        })
        // 同时更新消息自身的 toolCalls（用于历史记录持久化）
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== msgId) return m
            const toolCalls = m.toolCalls || []
            if (toolCalls.length === 0) return m
            const newToolCalls = [...toolCalls]
            newToolCalls[newToolCalls.length - 1] = { ...newToolCalls[newToolCalls.length - 1], result: event.result }
            return { ...m, toolCalls: newToolCalls }
          })
        )
        break
      case 'token':
        // 👈 只要第一个 Token 出来，立刻强行关闭思考状态，防止 UI 闪烁
        if (!thinkingFinished) setThinkingFinished(true)
        if (!event.content) break
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: m.content + event.content } : m)))
        break
      case 'table_info':
        if (event.table_id) setActiveTableId(event.table_id)
        break
      case 'done':
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: event.content || m.content } : m)))
        break
      case 'cancelled':
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: (m.content || '') + '[生成已取消]' } : m)))
        break
      case 'error':
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: `Error: ${event.content}` } : m)))
        break
    }
  }

  const getToolDisplayName = (name: string) => {
    const names: Record<string, string> = {
      filter_data: '数据筛选',
      aggregate_data: '数据聚合',
      group_and_aggregate: '分组统计',
      sort_data: '数据排序',
      search_data: '数据搜索',
      get_column_stats: '列统计',
      get_unique_values: '获取唯一值',
      get_data_preview: '数据预览',
      get_current_time: '获取时间',
      calculate: '数学计算',
      generate_chart: '生成图表',
    }
    return names[name] || name
  }

  // 把返回值类型从 string 改为 React.ReactNode
  const formatToolResult = (result: unknown): React.ReactNode => {
    if (!result || typeof result !== 'object') return String(result)

    const r = result as Record<string, unknown>

    if (r.chart) return `[图表: ${r.message || '已生成'}]`

    if (r.result !== undefined && r.column && r.function) {
      return `${r.column} 的 ${r.function}: ${r.result}`
    }

    if (r.column && r.count !== undefined) {
      return `${r.column}: 总数 ${r.count}, 唯一值 ${r.unique_count || 'N/A'}`
    }

    if (r.data && Array.isArray(r.data)) {
      const total = r.total_rows || r.data.length
      const returned = r.returned_rows || r.data.length
      const cols = (r.columns as string[]) || Object.keys(r.data[0] || {})

      return (
        <Box mt="xs">
          <Text size="xs" mb="xs" c="chatbox-tertiary">
            {'查询到 ' + total + ' 条数据' + (returned < total ? ' (显示前 ' + returned + ' 条)' : '')}
          </Text>

          {/* 折叠预览面板，避免表格撑爆聊天框 */}
          {r.data.length > 0 && (
            <details style={{ cursor: 'pointer', marginTop: '4px' }}>
              <summary style={{ fontSize: '12px', color: '#6366f1', fontWeight: 500, marginBottom: '8px' }}>
                查看数据预览
              </summary>
              <ScrollArea w="100%" type="auto" mt="xs">
                <Box style={{ minWidth: 600 }}>
                  <Table striped highlightOnHover verticalSpacing="xs">
                    <Table.Thead>
                      <Table.Tr>
                        {cols.map(c => <Table.Th key={c} style={{ whiteSpace: 'nowrap' }}>{c}</Table.Th>)}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {r.data.map((row: any, i) => (
                        <Table.Tr key={i}>
                          {cols.map(c => (
                            <Table.Td key={c} style={{ whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {row[c] === null || row[c] === undefined || row[c] === "" ? (
                                 <Text c="dimmed" size="xs">-</Text>
                              ) : (
                                 String(row[c])
                              )}
                            </Table.Td>
                          ))}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Box>
              </ScrollArea>
            </details>
          )}
        </Box>
      )
    }

    return <pre className="text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>
  }

  return (
    <Page
      title={
        <Flex align="center" gap="xs">
          <IconTableShortcut size={20} />
          <span>Excel 数据分析</span>
        </Flex>
      }
    >
      <Flex h="calc(100% - 54px)" gap={0}>
        {/* Left Sidebar - Table List */}
        <Box
          w={280}
          className="border-r border-chatbox-border-primary overflow-hidden flex flex-col"
          style={{
            display: showSidebar && !isSmallScreen ? 'flex' : 'none',
            width: isSmallScreen ? '100%' : Math.min(280, sidebarWidth),
          }}
        >
          {/* Upload Zone */}
          <Box p="sm" className="border-b border-chatbox-border-primary">
            <Dropzone
              onDrop={handleFileUpload}
              accept={['.xlsx', '.xls', '.xlsm']}
              loading={uploadLoading}
              multiple
              h={100}
              className="border-2 border-dashed border-chatbox-border-primary rounded-lg flex items-center justify-center cursor-pointer hover:border-chatbox-brand transition-colors"
            >
              <Stack align="center" gap="xs">
                <IconUpload size={24} className="text-chatbox-tertiary" />
                <Text size="xs" c="chatbox-tertiary">
                  {uploadLoading ? '上传中...' : '拖拽或点击上传 Excel'}
                </Text>
              </Stack>
            </Dropzone>
          </Box>

          {/* Table List */}
          <Box className="flex-1 overflow-hidden">
            <Flex
              align="center"
              justify="space-between"
              px="sm"
              py="xs"
              className="border-b border-chatbox-border-primary"
            >
              <Flex align="center" gap="xs">
                <Text size="xs" fw={600} c="chatbox-tertiary">
                  数据表 ({tables.length})
                </Text>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="chatbox-tertiary"
                  onClick={() => {
                    fetchSessionsList()
                    setHistoryModalOpen(true)
                  }}
                  title="历史会话"
                >
                  <IconHistory size={14} />
                </ActionIcon>
              </Flex>
              {tables.length > 0 && (
                <Menu shadow="md" width={160}>
                  <Menu.Target>
                    <ActionIcon size="xs" variant="subtle" color="chatbox-tertiary">
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      color="red"
                      onClick={handleDeleteAllTables}
                    >
                      清空所有
                    </Menu.Item>
                    <Menu.Item
                      onClick={() => {
                        setSelectedDeleteIds(tables.map(t => t.id))
                        setDeleteSelectModalOpen(true)
                      }}
                    >
                      选择删除
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              )}
            </Flex>

            <ScrollArea h="calc(100% - 40px)" p="xs">
              {tables.length === 0 ? (
                <Text size="xs" c="chatbox-tertiary" ta="center" py="xl">
                  暂无数据表
                </Text>
              ) : (
                <Stack gap="xs">
                  {tables.map((table) => (
                    <Paper
                      key={table.id}
                      p="xs"
                      radius="sm"
                      className={`cursor-pointer transition-colors ${
                        table.id === activeTableId
                          ? 'bg-chatbox-background-brand-secondary border border-chatbox-brand'
                          : 'bg-chatbox-background-secondary hover:bg-chatbox-background-tertiary'
                      }`}
                      onClick={() => setActiveTableId(table.id)}
                    >
                      <Flex align="center" gap="xs">
                        <IconFileSpreadsheet
                          size={16}
                          className={table.id === activeTableId ? 'text-chatbox-brand' : ''}
                        />
                        <Box className="flex-1 min-w-0">
                          <Text size="xs" fw={500} lineClamp={1}>
                            {table.filename}
                          </Text>
                          <Text size="xxs" c="chatbox-tertiary">
                            {table.sheet_name} · {table.total_rows} 行 × {table.total_columns} 列
                          </Text>
                        </Box>
                        {table.all_sheets && table.all_sheets.length > 1 ? (
                          <Menu shadow="md" width={200}>
                            <Menu.Target>
                              <ActionIcon size="xs" variant="subtle" color="chatbox-tertiary" onClick={(e) => e.stopPropagation()}>
                                <IconChevronDown size={14} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown style={{ maxHeight: 300, overflowY: 'auto' }}>
                              <Menu.Label>切换工作表</Menu.Label>
                              {table.all_sheets.map((sheet) => (
                                <Menu.Item
                                  key={sheet}
                                  onClick={() => handleSwitchSheet(table.id, sheet)}
                                  disabled={sheet === table.sheet_name}
                                >
                                  {sheet} {sheet === table.sheet_name && '✓'}
                                </Menu.Item>
                              ))}
                              <Menu.Divider />
                              <Menu.Item
                                color="red"
                                onClick={() => handleDeleteTable(table.id)}
                              >
                                删除表
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        ) : (
                          <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="chatbox-tertiary"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteTable(table.id)
                            }}
                          >
                            <IconX size={12} />
                          </ActionIcon>
                        )}
                      </Flex>
                    </Paper>
                  ))}
                </Stack>
              )}
            </ScrollArea>

            {/* Knowledge Base Status */}
            <Box p="sm" className="border-t border-chatbox-border-primary">
              <Flex align="center" justify="space-between" mb="xs">
                <Text size="xs" fw={600} c="chatbox-tertiary">
                  知识库
                </Text>
                {kbInitializing && <IconLoader2 size={12} className="animate-spin text-chatbox-brand" />}
              </Flex>
              {kbStats ? (
                <Text size="xxs" c={kbStats.total_entries > 0 ? 'chatbox-success' : 'chatbox-tertiary'}>
                  {kbStats.total_entries > 0 ? `已加载 ${kbStats.total_entries} 条知识` : '暂无知识'}
                </Text>
              ) : (
                <Text size="xxs" c="chatbox-tertiary">
                  加载中...
                </Text>
              )}
            </Box>
          </Box>
        </Box>

        {/* Main Chat Area */}
        <Box className="flex-1 flex flex-col overflow-hidden">
          {/* Active Table Indicator */}
          <Box px="md" py="xs" className="border-b border-chatbox-border-primary bg-chatbox-background-secondary">
            <Flex align="center" gap="xs">
              <Text size="xs" c="chatbox-tertiary">
                当前表:
              </Text>
              {activeTable ? (
                <Paper px="xs" py={2} radius="sm" className="bg-chatbox-background-brand-secondary">
                  <Text size="xs" fw={500} c="chatbox-brand">
                    {activeTable.filename} - {activeTable.sheet_name}
                  </Text>
                </Paper>
              ) : (
                <Text size="xs" c="chatbox-tertiary">
                  请上传 Excel 文件
                </Text>
              )}
            </Flex>
          </Box>

          {/* Messages */}
          <ScrollArea
            viewportRef={scrollViewportRef}
            className="flex-1 p-4"
          >
            {messages.length === 0 ? (
              <Flex direction="column" align="center" justify="center" h="100%" gap="sm">
                <IconTableShortcut size={48} className="text-chatbox-tertiary opacity-50" />
                <Text c="chatbox-tertiary">{activeTableId ? '开始询问数据问题' : '请先上传 Excel 文件'}</Text>
              </Flex>
            ) : (
              <Stack gap="md">
                {messages.map((msg) => (
                  <Box key={msg.id}>
                    {/* User Message */}
                    {msg.role === 'user' && (
                      <Box mb="sm">
                        <Paper
                          p="sm"
                          radius="lg"
                          className="bg-chatbox-background-brand-primary text-white max-w-[80%] ml-auto"
                        >
                          <Text size="sm">{msg.content}</Text>
                        </Paper>
                      </Box>
                    )}

                    {/* Assistant Message */}
                    {msg.role === 'assistant' && (
                      <Box className="max-w-[80%]">
                        {/* Thinking Block */}
                        {currentThinking !== null && msg.content === '' && !thinkingFinished && (
                          <Paper
                            p="sm"
                            mb="sm"
                            radius="md"
                            className="border-l-2 border-chatbox-brand bg-chatbox-background-secondary"
                          >
                            <Flex align="center" gap="xs" mb="xs">
                              <Text size="xs" fw={500} c="chatbox-brand">
                                思考中
                              </Text>
                              <IconLoader2 size={12} className="animate-spin text-chatbox-brand" />
                            </Flex>
                            <Text size="xs" c="chatbox-secondary" style={{ whiteSpace: 'pre-wrap' }}>
                              {currentThinking}
                            </Text>
                          </Paper>
                        )}

                        {/* Tool Calls */}
                        {(msg.toolCalls && msg.toolCalls.length > 0 ? msg.toolCalls : msg.id === currentStreamingMsgIdRef.current ? currentToolCalls : []).map((tool, idx) => (
                          <Paper
                            key={idx}
                            p="sm"
                            mb="sm"
                            radius="md"
                            className="border-l-2 border-chatbox-warning bg-chatbox-background-secondary"
                          >
                            <Flex align="center" gap="xs" mb="xs">
                              <Text size="xs" fw={500} c="chatbox-warning">
                                🔧 {getToolDisplayName(tool.name)}
                              </Text>
                            </Flex>
                            {tool.result &&
                              (() => {
                                const result = tool.result as Record<string, unknown>
                                // Check if result contains a chart
                                if (result.chart) {
                                  return (
                                    <Box mt="xs">
                                      <ChartRenderer
                                        chartConfig={result.chart as Record<string, unknown>}
                                        message={result.message as string}
                                        height={350}
                                      />
                                    </Box>
                                  )
                                }
                                // Regular text result
                                return (
                                  <Box
                                    mt="xs"
                                    p="xs"
                                    className={`rounded text-xs ${
                                      result.error
                                        ? 'bg-chatbox-background-error-secondary text-chatbox-error'
                                        : 'bg-chatbox-background-primary text-chatbox-success'
                                    }`}
                                  >
                                    {formatToolResult(tool.result)}
                                  </Box>
                                )
                              })()}
                          </Paper>
                        ))}

                        {/* Assistant Content */}
                        {msg.content && (
                          <Paper
                            p="sm"
                            radius="md"
                            className="bg-chatbox-background-secondary prose prose-sm max-w-none"
                          >
                            <Markdown className="text-sm">{msg.content}</Markdown>
                          </Paper>
                        )}
                      </Box>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </ScrollArea>

          {/* Input Area */}
          <Box p="md" className="border-t border-chatbox-border-primary bg-chatbox-background-secondary">
            <Flex gap="sm" align="flex-end">
              <ActionIcon
                size="lg"
                variant="subtle"
                color="chatbox-tertiary"
                onClick={handleNewConversation}
                disabled={messages.length === 0 || isProcessing}
                title="全新对话"
              >
                <IconPlus size={18} />
              </ActionIcon>
              <TextInput
                flex={1}
                placeholder={activeTableId ? '输入问题，例如：这个表有多少行？' : '请先上传 Excel 文件'}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                disabled={!activeTableId || isProcessing || !historyLoaded}
                size="sm"
              />
              {isProcessing ? (
                <Button
                  onClick={cancelChat}
                  color="red"
                  size="sm"
                >
                  取消
                </Button>
              ) : (
                <Button
                  onClick={handleSendMessage}
                  disabled={!activeTableId || isProcessing || !historyLoaded || !inputValue.trim()}
                  loading={isProcessing}
                  size="sm"
                >
                  发送
                </Button>
              )}
            </Flex>
          </Box>
        </Box>
      </Flex>

      {/* 工作表选择弹窗 */}
      <Modal
        opened={sheetSelectModalOpen}
        onClose={() => {
          // 关闭时默认加载第一个工作表（已预加载）
          if (pendingSheets?.preloadedTables && pendingSheets?.preloadedTableId) {
            setTables(pendingSheets.preloadedTables)
            setActiveTableId(pendingSheets.preloadedTableId)
          }
          setSheetSelectModalOpen(false)
          setPendingSheets(null)
        }}
        title="选择工作表"
        centered
        size="sm"
      >
        <Text size="sm" mb="md" c="dimmed">
          文件 <strong>{pendingSheets?.filename}</strong> 包含多个工作表，请选择要加载的工作表：
        </Text>
        <Stack gap="xs">
          {pendingSheets?.allSheets.map((sheet, index) => (
            <Button
              key={sheet}
              variant="light"
              fullWidth
              onClick={() => handleLoadSheet(sheet, index === 0)}
              loading={uploadLoading}
            >
              {sheet} {index === 0 && '（已预加载）'}
            </Button>
          ))}
        </Stack>
      </Modal>

      {/* 选择删除弹窗 */}
      <Modal
        opened={deleteSelectModalOpen}
        onClose={() => {
          setDeleteSelectModalOpen(false)
          setSelectedDeleteIds([])
        }}
        title="选择要删除的表格"
        centered
        size="md"
      >
        <Text size="sm" mb="md" c="dimmed">
          勾选要删除的表格，点击确认后删除：
        </Text>
        <Stack gap="xs" mih={200} style={{ maxHeight: 400, overflowY: 'auto' }}>
          {tables.map((table) => (
            <Paper
              key={table.id}
              p="xs"
              radius="sm"
              className={`cursor-pointer transition-colors ${
                selectedDeleteIds.includes(table.id)
                  ? 'bg-chatbox-background-brand-secondary border border-chatbox-brand'
                  : 'bg-chatbox-background-secondary'
              }`}
              onClick={() => {
                setSelectedDeleteIds((prev) =>
                  prev.includes(table.id)
                    ? prev.filter((id) => id !== table.id)
                    : [...prev, table.id]
                )
              }}
            >
              <Flex align="center" gap="xs">
                <Checkbox
                  checked={selectedDeleteIds.includes(table.id)}
                  onChange={() => {}}
                />
                <IconFileSpreadsheet size={16} />
                <Box className="flex-1 min-w-0">
                  <Text size="xs" fw={500} lineClamp={1}>
                    {table.filename}
                  </Text>
                  <Text size="xxs" c="chatbox-tertiary">
                    {table.sheet_name} · {table.total_rows} 行 × {table.total_columns} 列
                  </Text>
                </Box>
              </Flex>
            </Paper>
          ))}
        </Stack>
        <Flex justify="flex-end" gap="xs" mt="md">
          <Button variant="default" onClick={() => {
            setDeleteSelectModalOpen(false)
            setSelectedDeleteIds([])
          }}>
            取消
          </Button>
          <Button
            color="red"
            onClick={handleDeleteSelectedTables}
            disabled={selectedDeleteIds.length === 0}
          >
            删除 ({selectedDeleteIds.length})
          </Button>
        </Flex>
      </Modal>

      {/* 历史会话弹窗 */}
      <Modal
        opened={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title="历史会话"
        centered
        size="md"
      >
        <Text size="sm" mb="md" c="dimmed">
          选择一个历史会话加载，或删除不需要的会话：
        </Text>
        <Stack gap="xs" mih={200} style={{ maxHeight: 400, overflowY: 'auto' }}>
          {historySessions.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              暂无历史会话
            </Text>
          ) : (
            historySessions.map((session) => (
              <Paper
                key={session.session_id}
                p="xs"
                radius="sm"
                className={`cursor-pointer transition-colors ${
                  session.session_id === sessionId
                    ? 'bg-chatbox-background-brand-secondary border border-chatbox-brand'
                    : 'bg-chatbox-background-secondary hover:bg-chatbox-background-tertiary'
                }`}
              >
                <Flex align="center" justify="space-between">
                  <Box className="flex-1 min-w-0" onClick={() => loadSession(session.session_id)}>
                    <Text size="xs" fw={500} lineClamp={1}>
                      {session.session_id === sessionId ? '当前会话' : `会话 ${session.session_id.slice(0, 12)}...`}
                    </Text>
                    <Text size="xxs" c="chatbox-tertiary">
                      {session.file_count} 个文件 · {session.message_count} 条消息
                    </Text>
                    <Text size="xxs" c="chatbox-tertiary">
                      最后访问：{new Date(session.last_accessed).toLocaleString()}
                    </Text>
                  </Box>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm('确定要删除这个会话吗？这将删除所有相关的文件和聊天记录。')) {
                        deleteSession(session.session_id)
                      }
                    }}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Flex>
              </Paper>
            ))
          )}
        </Stack>
        <Flex justify="flex-end" gap="xs" mt="md">
          <Button variant="default" onClick={() => setHistoryModalOpen(false)}>
            关闭
          </Button>
        </Flex>
      </Modal>
    </Page>
  )
}
