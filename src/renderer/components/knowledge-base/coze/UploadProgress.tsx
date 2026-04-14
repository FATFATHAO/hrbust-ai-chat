import {
  ActionIcon,
  Box,
  Button,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import type React from 'react'
import type { UploadTask, UploadQueueState, UploadStatus } from './types'
import { formatFileSize } from '@shared/utils'

interface UploadProgressPanelProps {
  queueState: UploadQueueState
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onRetryFailed: () => void
  onRetrySingle: (taskId: string) => void
  onRemoveTask: (taskId: string) => void
  onClearFinished: () => void
}

export const UploadProgressPanel: React.FC<UploadProgressPanelProps> = ({
  queueState,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
  onRetrySingle,
  onRemoveTask,
  onClearFinished,
}) => {
  const {
    tasks,
    isPaused,
    completedFiles,
    failedFiles,
    totalFiles,
    bytesUploaded,
    totalBytes,
  } = queueState

  const overallProgress =
    totalBytes > 0 ? Math.round((bytesUploaded / totalBytes) * 100) : 0

  const hasFinishedTasks = tasks.some(
    (t) => t.status === 'completed' || t.status === 'cancelled'
  )

  return (
    <Paper withBorder radius="md" p="md" mt="md">
      {/* 头部控制栏 */}
      <Group justify="space-between" mb="sm">
        <Text fw={600}>
          上传队列 ({completedFiles}/{totalFiles} 完成)
          {failedFiles > 0 && `, ${failedFiles} 失败`}
        </Text>
        <Group gap="xs">
          {isPaused ? (
            <Button
              size="xs"
              leftSection={<IconPlayerPlay size={14} />}
              onClick={onResume}
              color="green"
            >
              继续
            </Button>
          ) : (
            <Button
              size="xs"
              leftSection={<IconPlayerPause size={14} />}
              onClick={onPause}
              color="yellow"
            >
              暂停
            </Button>
          )}
          <Button
            size="xs"
            leftSection={<IconX size={14} />}
            onClick={onCancel}
            color="red"
            variant="outline"
          >
            取消全部
          </Button>
          {failedFiles > 0 && (
            <Button
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={onRetryFailed}
              color="blue"
              variant="light"
            >
              重试失败 ({failedFiles})
            </Button>
          )}
          {hasFinishedTasks && (
            <Button
              size="xs"
              onClick={onClearFinished}
              variant="subtle"
              color="gray"
            >
              清空已完成
            </Button>
          )}
        </Group>
      </Group>

      {/* 总体进度 */}
      <Box mb="md">
        <Group justify="space-between" mb={4}>
          <Text size="sm" c="dimmed">
            总体进度
          </Text>
          <Text size="sm" c="dimmed">
            {overallProgress}%
          </Text>
        </Group>
        <Progress value={overallProgress} size="lg" radius="md" />
      </Box>

      {/* 文件列表 */}
      <Stack
        gap="xs"
        mih={200}
        style={{ maxHeight: 400, overflowY: 'auto' }}
      >
        {tasks.map((task) => (
          <UploadTaskItem
            key={task.id}
            task={task}
            onRetry={() => onRetrySingle(task.id)}
            onRemove={() => onRemoveTask(task.id)}
          />
        ))}
      </Stack>
    </Paper>
  )
}

interface UploadTaskItemProps {
  task: UploadTask
  onRetry: () => void
  onRemove: () => void
}

const UploadTaskItem: React.FC<UploadTaskItemProps> = ({
  task,
  onRetry,
  onRemove,
}) => {
  const statusColors: Record<UploadStatus, string> = {
    pending: 'gray',
    uploading: 'blue',
    processing: 'cyan',
    completed: 'green',
    failed: 'red',
    paused: 'yellow',
    cancelled: 'gray',
  }

  const statusLabels: Record<UploadStatus, string> = {
    pending: '等待中',
    uploading: '上传中',
    processing: '处理中',
    completed: '已完成',
    failed: '失败',
    paused: '已暂停',
    cancelled: '已取消',
  }

  return (
    <Paper withBorder p="xs" radius="sm">
      <Group justify="space-between" wrap="nowrap">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={500} truncate style={{ maxWidth: 200 }}>
              {task.fileName}
            </Text>
            <Text size="xs" c="dimmed">
              {formatFileSize(task.fileSize)}
            </Text>
          </Group>

          {/* 进度条 */}
          {(task.status === 'uploading' || task.status === 'processing') && (
            <Progress value={task.progress} size="xs" mt={4} color="blue" />
          )}

          {/* 错误信息 */}
          {task.status === 'failed' && task.error && (
            <Text size="xs" c="red" mt={2}>
              {task.error}
            </Text>
          )}

          {/* 重试次数 */}
          {task.status === 'failed' && task.retryCount > 0 && (
            <Text size="xs" c="dimmed" mt={2}>
              已重试 {task.retryCount} 次
            </Text>
          )}
        </Box>

        <Group gap="xs" wrap="nowrap">
          <Text size="xs" c={statusColors[task.status]}>
            {statusLabels[task.status]}
          </Text>

          {task.status === 'failed' && (
            <Tooltip label="重试">
              <ActionIcon
                size="sm"
                color="blue"
                variant="subtle"
                onClick={onRetry}
              >
                <IconRefresh size={14} />
              </ActionIcon>
            </Tooltip>
          )}

          {(task.status === 'pending' ||
            task.status === 'failed' ||
            task.status === 'cancelled' ||
            task.status === 'completed') && (
            <Tooltip label="移除">
              <ActionIcon
                size="sm"
                color="red"
                variant="subtle"
                onClick={onRemove}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
    </Paper>
  )
}
