// 安全验证常量
const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md', '.docx', '.doc']
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

// 最大文件大小: 100GB (Coze API 限制)
const MAX_FILE_SIZE = 100 * 1024 * 1024 * 1024

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface FileValidationOptions {
  maxSize?: number
  allowedExtensions?: string[]
  allowedMimeTypes?: string[]
}

/**
 * 验证单个文件的安全性和格式合规性
 */
export function validateFile(
  file: File,
  options: FileValidationOptions = {}
): ValidationResult {
  const {
    maxSize = MAX_FILE_SIZE,
    allowedExtensions = ALLOWED_EXTENSIONS,
    allowedMimeTypes = ALLOWED_MIME_TYPES,
  } = options

  // 检查文件大小
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `文件大小超过限制 (最大 ${formatFileSize(maxSize)})`,
    }
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: '文件为空',
    }
  }

  // 检查文件扩展名
  const fileName = file.name.toLowerCase()
  const hasValidExtension = allowedExtensions.some((ext) =>
    fileName.endsWith(ext.toLowerCase())
  )

  // 检查 MIME type
  const hasValidMimeType =
    !file.type || // 文件类型为空时跳过 MIME 检查
    allowedMimeTypes.some(
      (mime) => file.type.toLowerCase() === mime.toLowerCase()
    )

  if (!hasValidExtension && !hasValidMimeType) {
    return {
      valid: false,
      error: `不支持的文件格式，支持: ${allowedExtensions.join(', ')}`,
    }
  }

  // 额外安全检查: 文件名危险字符
  if (/[<>:"|?*]/.test(file.name)) {
    return {
      valid: false,
      error: '文件名包含非法字符',
    }
  }

  // 检查路径遍历尝试
  if (file.name.includes('..') || file.name.includes('/')) {
    return {
      valid: false,
      error: '文件名路径不合法',
    }
  }

  return { valid: true }
}

/**
 * 批量验证多个文件
 */
export function validateFiles(
  files: File[],
  options: FileValidationOptions = {}
): { valid: File[]; invalid: { file: File; error: string }[] } {
  const valid: File[] = []
  const invalid: { file: File; error: string }[] = []

  for (const file of files) {
    const result = validateFile(file, options)
    if (result.valid) {
      valid.push(file)
    } else {
      invalid.push({ file, error: result.error || '未知错误' })
    }
  }

  return { valid, invalid }
}

/**
 * 从文件扩展名推断 MIME type (用于 Windows 兼容性)
 */
export function inferMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  return mimeMap[ext || ''] || 'application/octet-stream'
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
