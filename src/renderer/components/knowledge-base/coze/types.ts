// 上传任务状态
export type UploadStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled'

// 单个文件上传任务
export interface UploadTask {
  id: string
  file: File
  fileName: string
  fileSize: number
  fileType: string
  status: UploadStatus
  progress: number // 0-100
  error?: string
  retryCount: number
  createdAt: number
  // API 响应字段
  fileId?: string
  fileUri?: string
  documentId?: string
}

// 批量上传队列状态
export interface UploadQueueState {
  tasks: UploadTask[]
  isPaused: boolean
  isUploading: boolean
  totalFiles: number
  completedFiles: number
  failedFiles: number
  bytesUploaded: number
  totalBytes: number
}

// 队列配置
export interface UploadQueueConfig {
  maxConcurrent: number // 最大并发数，默认 3
  maxRetries: number // 单文件最大重试次数，默认 3
  retryDelay: number // 重试间隔 ms，默认 1000
}
