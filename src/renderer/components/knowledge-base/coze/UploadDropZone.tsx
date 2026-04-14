import { Box, Paper, Stack, Text } from '@mantine/core'
import { IconUpload } from '@tabler/icons-react'
import React, { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { validateFiles } from './validation'

interface UploadDropZoneProps {
  accept: string
  maxFileSize?: number
  maxFiles?: number
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
}

export const UploadDropZone: React.FC<UploadDropZoneProps> = ({
  accept,
  maxFileSize = 100 * 1024 * 1024 * 1024, // 100GB
  maxFiles,
  onFilesSelected,
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled) setIsDragOver(true)
    },
    [disabled]
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // 只有当 drag 离开容器本身时才清除状态
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      if (disabled) return

      const files = Array.from(e.dataTransfer.files)

      // 验证文件
      const { valid, invalid } = validateFiles(files, { maxSize: maxFileSize })

      // 显示验证失败的文件
      invalid.forEach(({ file, error }) => {
        toast.error(`${file.name}: ${error}`)
      })

      // 检查数量限制
      let validToAdd = valid
      if (maxFiles && valid.length > maxFiles) {
        toast.error(`最多只能选择 ${maxFiles} 个文件，已截断`)
        validToAdd = valid.slice(0, maxFiles)
      }

      if (validToAdd.length > 0) {
        onFilesSelected(validToAdd)
      }
    },
    [disabled, maxFileSize, maxFiles, onFilesSelected]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])

      // 验证文件
      const { valid, invalid } = validateFiles(files, { maxSize: maxFileSize })

      invalid.forEach(({ file, error }) => {
        toast.error(`${file.name}: ${error}`)
      })

      let validToAdd = valid
      if (maxFiles && valid.length > maxFiles) {
        toast.error(`最多只能选择 ${maxFiles} 个文件，已截断`)
        validToAdd = valid.slice(0, maxFiles)
      }

      if (validToAdd.length > 0) {
        onFilesSelected(validToAdd)
      }

      // 重置 input 以便再次选择相同文件
      e.target.value = ''
    },
    [maxFileSize, maxFiles, onFilesSelected]
  )

  const openFileDialog = useCallback(() => {
    inputRef.current?.click()
  }, [])

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Paper
        withBorder
        p="xl"
        radius="md"
        style={{
          border: isDragOver
            ? '2px dashed var(--mantine-color-blue-filled)'
            : '2px dashed var(--mantine-color-gray-4)',
          backgroundColor: isDragOver
            ? 'var(--mantine-color-blue-0)'
            : 'var(--mantine-color-gray-0)',
          transition: 'all 0.2s ease',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
        onClick={disabled ? undefined : openFileDialog}
      >
        <Stack align="center" gap="sm">
          <IconUpload
            size={32}
            color={
              isDragOver
                ? 'var(--mantine-color-blue-filled)'
                : 'var(--mantine-color-gray-6)'
            }
          />
          <Text
            size="sm"
            fw={500}
            ta="center"
            c={isDragOver ? 'blue' : 'dimmed'}
          >
            {isDragOver ? '释放文件以上传' : '拖拽文件到这里，或点击选择文件'}
          </Text>
          <Text size="xs" c="dimmed" ta="center">
            支持格式: {accept}
          </Text>
        </Stack>
      </Paper>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
    </Box>
  )
}
