// 上传任务状态
export type UploadStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled'

// 当前上传步骤
export type UploadStep =
  | 'upload'
  | 'create_review'
  | 'get_chunks'
  | 'save_chunks'
  | 'create_document'

// 文档审查信息
export interface ReviewInfo {
  review_id: string
  document_name: string
  document_type: string
  tos_url: string
  status?: string
  doc_tree_tos_url?: string
  preview_tos_url?: string
}

// 单个 Chunk
export interface Chunk {
  id: string
  text: string
  type?: string
}

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
  // 新流程字段
  uploadUri?: string // upload_uri
  reviewId?: string // review_id
  documentName?: string // 文档名称
  documentType?: string // 文档类型
  tosUrl?: string // tos_url
  docTreeTosUrl?: string // doc_tree_tos_url
  previewTosUrl?: string // preview_tos_url
  chunks?: Chunk[] // 文档切片
  chunksLoaded?: boolean // chunks 是否已加载
  chunksSaved?: boolean // chunks 是否已保存
  knowledgeDocumentId?: string // 最终文档 ID
  currentStep?: UploadStep // 当前处理的子步骤
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
