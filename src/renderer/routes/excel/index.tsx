import '@mantine/dropzone/styles.css'
import { ActionIcon, Box, Button, Flex, Paper, ScrollArea, Stack, Text, TextInput } from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { IconFileSpreadsheet, IconLoader2, IconTableShortcut, IconTrash, IconUpload, IconX } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChartRenderer } from '@/components/excel/ChartRenderer'
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
  content?: string
  name?: string
  args?: Record<string, unknown>
  result?: unknown
  table_id?: string
}

// API Base URL - configurable
const API_BASE = import.meta.env.VITE_EXCEL_API_URL || 'http://localhost:48000'

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

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const showSidebar = useUIStore((s) => s.showSidebar)
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)

  // Active table
  const activeTable = tables.find((t) => t.id === activeTableId)

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, currentThinking, currentToolCalls, scrollToBottom])

  // Fetch tables on mount
  useEffect(() => {
    fetchTables()
    initKnowledgeBase()
  }, [])

  const fetchTables = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`)
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
      const statsRes = await fetch(`${API_BASE}/knowledge/stats`)
      if (statsRes.ok) {
        const stats = await statsRes.json()
        setKbStats(stats)
        // If no entries, trigger indexing
        if (stats.total_entries === 0) {
          setKbInitializing(true)
          const indexRes = await fetch(`${API_BASE}/knowledge/index`, { method: 'POST' })
          if (indexRes.ok) {
            const indexResult = await indexRes.json()
            console.log('[知识库] 索引完成:', indexResult)
            // Refresh stats
            const newStatsRes = await fetch(`${API_BASE}/knowledge/stats`)
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
        const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          if (data.tables) setTables(data.tables)
          if (data.table_id) setActiveTableId(data.table_id)
        }
      } catch (e) {
        console.error('Upload failed:', e)
      }
    }
    setUploadLoading(false)
  }

  const handleDeleteTable = async (tableId: string) => {
    try {
      const res = await fetch(`${API_BASE}/tables/${tableId}`, { method: 'DELETE' })
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

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isProcessing || !activeTableId) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      tableId: activeTableId,
      tableName: activeTable?.filename,
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsProcessing(true)
    setCurrentThinking(null)
    setThinkingFinished(false)
    setCurrentToolCalls([])

    // Add placeholder assistant message
    const assistantMsgId = (Date.now() + 1).toString()

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
            tableName: m.tableName || '',
          })),
        }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event: StreamEvent = JSON.parse(line.slice(6))
                await handleStreamEvent(event, assistantMsgId)
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Chat error:', e)
    } finally {
      setIsProcessing(false)
      setThinkingFinished(true)
    }
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
        setCurrentToolCalls((prev) => [...prev, { name: event.name || '', args: event.args || {} }])
        break
      case 'tool_result':
        setCurrentToolCalls((prev) => {
          const updated = [...prev]
          if (updated.length > 0) {
            updated[updated.length - 1].result = event.result
          }
          return updated
        })
        break
      case 'token':
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, content: m.content + (event.content || '') } : m))
        )
        break
      case 'table_info':
        if (event.table_id) setActiveTableId(event.table_id)
        break
      case 'done':
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: event.content || m.content } : m)))
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

  const formatToolResult = (result: unknown): string => {
    if (!result || typeof result !== 'object') return String(result)

    const r = result as Record<string, unknown>

    // Chart result
    if (r.chart) {
      return `[图表: ${r.message || '已生成'}]`
    }

    // Aggregation result
    if (r.result !== undefined && r.column && r.function) {
      return `${r.column} 的 ${r.function}: ${r.result}`
    }

    // Data list result
    if (r.data && Array.isArray(r.data)) {
      const total = r.total_rows || r.data.length
      const returned = r.returned_rows || r.data.length
      return `查询到 ${total} 条数据${returned < total ? ` (显示前 ${returned} 条)` : ''}`
    }

    // Column stats
    if (r.column && r.count !== undefined) {
      return `${r.column}: 总数 ${r.count}, 唯一值 ${r.unique_count || 'N/A'}`
    }

    // Default JSON
    return JSON.stringify(result, null, 2)
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
              <Text size="xs" fw={600} c="chatbox-tertiary">
                数据表 ({tables.length})
              </Text>
              {tables.length > 0 && (
                <ActionIcon size="xs" variant="subtle" color="chatbox-tertiary" onClick={() => setTables([])}>
                  <IconTrash size={14} />
                </ActionIcon>
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
                            {table.total_rows} 行 × {table.total_columns} 列
                          </Text>
                        </Box>
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
                {kbInitializing && (
                  <IconLoader2 size={12} className="animate-spin text-chatbox-brand" />
                )}
              </Flex>
              {kbStats ? (
                <Text size="xxs" c={kbStats.total_entries > 0 ? 'chatbox-success' : 'chatbox-tertiary'}>
                  {kbStats.total_entries > 0
                    ? `已加载 ${kbStats.total_entries} 条知识`
                    : '暂无知识'}
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
                    {activeTable.filename}
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
          <ScrollArea ref={chatContainerRef} className="flex-1 p-4" viewportProps={{ ref: messagesEndRef }}>
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
                        {currentToolCalls.map((tool, idx) => (
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
                            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                              {msg.content}
                            </Text>
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
                disabled={!activeTableId || isProcessing}
                size="sm"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!activeTableId || isProcessing || !inputValue.trim()}
                loading={isProcessing}
                size="sm"
              >
                发送
              </Button>
            </Flex>
          </Box>
        </Box>
      </Flex>
    </Page>
  )
}
