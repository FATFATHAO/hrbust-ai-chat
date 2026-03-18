import { ActionIcon, Badge, Button, Group, Paper, Stack, Table, Text, Title } from '@mantine/core'
import { IconArrowLeft, IconBookUpload, IconFileText, IconTrash } from '@tabler/icons-react'
import { useRouter } from '@tanstack/react-router'
import React, { useCallback, useRef, useState, useEffect } from 'react'
import { toast } from 'sonner'

interface KbFile {
  id: string
  name: string
  status: 'parsing' | 'completed' | 'error' | 'indexing' | 'waiting' | 'splitting'
  uploadDate: string
}

// @ts-ignore
// 动态读取！如果找不到就回退到原来的逻辑
const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001'

// const MOCK_FILES: KbFile[] = [
//   { id: '1', name: '20260215《黑龙江省“人工智能＋”政务深化应用工作方案》.pdf', status: 'completed', uploadDate: '2026-03-08' },
//   { id: '2', name: 'Dify_企业接入内部指南.pdf', status: 'parsing', uploadDate: '2026-03-08' },
// ]

const KnowledgeBasePage: React.FC = () => {
  const [files, setFiles] = useState<KbFile[]>([])
  const [loading, setLoading] = useState(true)

  // 上传文件部分
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 跳转
  const router = useRouter()

  const fetchFiles = useCallback(async (silent = false) => {
    // 如果不是静默拉取，才显示大 loading 圈
    if (!silent) setLoading(true)
    try {
      // @ts-ignore
      // const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001'
      const response = await fetch(`${API_BASE_URL}/api/files/list`)
      if (!response.ok) throw new Error('拉取列表失败')
      const data = await response.json()
      setFiles(data.files || [])
    } catch (error) {
      console.error('拉取知识库列表失败:', error)
      if (!silent) toast.error('获取知识库列表失败')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // 页面首次加载时获取列表
  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  useEffect(() => {
    // 检查当前列表里，是否有状态还是 'parsing' 的文件？
    const hasParsingFiles = files.some(
      (file) =>
        file.status === 'parsing' ||
        file.status === 'indexing' ||
        file.status === 'waiting' ||
        file.status === 'splitting',
    )

    let timer: NodeJS.Timeout

    // 只有存在正在解析的文件时，才启动 3 秒一次的静默轮询
    if (hasParsingFiles) {
      timer = setTimeout(() => {
        console.log('检测到文件解析中，静默刷新状态...')
        fetchFiles(true) // 传入 true，代表静默拉取，不打扰用户
      }, 3000)
    }

    // 组件卸载或状态变化时，清理定时器，绝不内存泄漏
    return () => clearTimeout(timer)
  }, [files, fetchFiles]) // 依赖项里加上 files，只要 files 变了，就会重新评估要不要继续轮询

  // 处理文件被选中后的自动上传
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 重置 input，这样哪怕用户紧接着上传同一份文件，也能正常触发 onChange
    event.target.value = ''

    // 组装发给 FastAPI 的包裹
    const formData = new FormData()
    formData.append('file', file)

    setIsUploading(true)
    const toastId = toast.loading('正在上传并送往大模型大脑...')

    try {
      const response = await fetch(`${API_BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData, // 直接发 formData，浏览器会自动设置 multipart/form-data
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.detail || '上传失败')
      }

      toast.success('上传成功，大模型正在阅读切片！', { id: toastId })

      // 这样用户就能马上在表格里看到新文件，并且状态是黄色的“解析中”
      await fetchFiles()
    } catch (error: any) {
      console.error('上传错误:', error)
      toast.error(`上传失败: ${error.message}`, { id: toastId })
    } finally {
      setIsUploading(false)
    }
  }

  // 点击漂亮按钮，实际上是点了丑陋的隐藏 input
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleDelete = async (fileId: string, fileName: string) => {
    // 极其必要的二次确认弹窗
    const confirmDelete = window.confirm(
      `⚠️ 危险操作确认\n\n确定要从知识库中彻底删除《${fileName}》吗？\n（此操作将同时清理大模型记忆和本地物理备份，且不可恢复）`,
    )

    if (!confirmDelete) return

    const toastId = toast.loading('正在执行数据抹除指令...')

    try {
      // 调用 FastAPI 删除接口，把 id 放进路径，把文件名作为 query 参数传过去以便本地清理
      const response = await fetch(
        `${API_BASE_URL}/api/files/delete/${fileId}?filename=${encodeURIComponent(fileName)}`,
        {
          method: 'DELETE',
        },
      )

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.detail || '删除请求失败')
      }

      toast.success('已成功抹除该文档的所有痕迹！', { id: toastId })

      // 抹除成功后，立刻重新拉取列表，界面瞬间清爽！
      await fetchFiles()
    } catch (error: any) {
      console.error('删除错误:', error)
      toast.error(`删除失败: ${error.message}`, { id: toastId })
    }
  }
  // 生成不同的颜色
  const renderStatusBadge = (status: KbFile['status']) => {
    switch (status) {
      case 'completed':
        return (
          <Badge color="green" variant="light">
            可用
          </Badge>
        )
      case 'error':
        return (
          <Badge color="red" variant="light">
            解析失败
          </Badge>
        )
      case 'parsing':
        return (
          <Badge color="yellow" variant="light" className="animate-pulse">
            文本解析中...
          </Badge>
        )
      case 'indexing':
        return (
          <Badge color="blue" variant="light" className="animate-pulse">
            建立向量索引...
          </Badge>
        )
      case 'waiting':
        return (
          <Badge color="yellow" variant="light" className="animate-pulse">
            等待中...
          </Badge>
        )
      case 'splitting':
        return (
          <Badge color="grape" variant="light" className="animate-pulse">
            分片中...
          </Badge>
        )
      default:
        return (
          <Badge color="gray" variant="light">
            未知状态
          </Badge>
        )
    }
  }

  return (
    <Stack p="md" gap="xl" h="100%" style={{ overflowY: 'auto' }}>
      {/* 头部区域 */}
      <Group justify="space-between" align="center">
        <Group align="flex-start" gap={'md'}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            title="返回聊天"
            onClick={() => router.history.back()}
            style={{ marginTop: '2px' }} // 微调一下对齐
          >
            <IconArrowLeft size={24} />
          </ActionIcon>
          <div>
            <Title order={4} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconBookUpload size={24} color="var(--mantine-color-blue-filled)" />
              专属知识库 (Dify RAG)
            </Title>
            <Text size="sm" c="dimmed" mt={4}>
              上传本地文档，让大模型深度阅读并为您提供精准解答。
            </Text>
          </div>
        </Group>

        {/* 上传按钮 */}
        <Group>
          <input
            type="file"
            accept=".pdf,.txt,.md,.docx" // 限制只能传这些类型
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <Button
            leftSection={<IconBookUpload size={16} />}
            color="blue"
            onClick={handleUploadClick}
            loading={isUploading} // 上传时按钮转圈圈，防止用户狂点
          >
            {isUploading ? '上传中...' : '上传文档'}
          </Button>
        </Group>
      </Group>

      {/* 列表区域 */}
      <Paper withBorder radius="md" shadow="sm">
        <Table verticalSpacing="sm" striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>文档名称</Table.Th>
              <Table.Th w={120}>状态</Table.Th>
              <Table.Th w={150}>上传时间</Table.Th>
              <Table.Th w={80} style={{ textAlign: 'center' }}>
                操作
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {files.length > 0 ? (
              files.map((file) => (
                <Table.Tr key={file.id}>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <IconFileText size={20} color="var(--mantine-color-red-500)" />
                      <Text size="sm" fw={500} truncate style={{ maxWidth: '300px' }} title={file.name}>
                        {file.name}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>{renderStatusBadge(file.status)}</Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {file.uploadDate}
                    </Text>
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'center' }}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      title="删除文档"
                      onClick={() => handleDelete(file.id, file.name)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" ta="center" py="xl">
                    知识库空空如也，快点击右上角上传第一份文档吧！
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  )
}

export default KnowledgeBasePage
