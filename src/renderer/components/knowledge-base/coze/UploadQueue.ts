import type {
  UploadTask,
  UploadQueueState,
  UploadQueueConfig,
  UploadStatus,
} from './types'

const DEFAULT_CONFIG: UploadQueueConfig = {
  maxConcurrent: 3,
  maxRetries: 3,
  retryDelay: 1000,
}

export class UploadQueue {
  private state: UploadQueueState
  private config: UploadQueueConfig
  private abortController: AbortController
  private paused = false
  private processingCount = 0

  // API 函数
  private uploadFileFn: (
    file: File
  ) => Promise<{ id: string; uri: string; file_name: string }>
  private createDocumentFn: (
    datasetId: string,
    fileInfo: { id: string; uri: string; file_name: string },
    fileName: string
  ) => Promise<string>

  constructor(
    config: Partial<UploadQueueConfig>,
    uploadFileFn: (
      file: File
    ) => Promise<{ id: string; uri: string; file_name: string }>,
    createDocumentFn: (
      datasetId: string,
      fileInfo: { id: string; uri: string; file_name: string },
      fileName: string
    ) => Promise<string>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.uploadFileFn = uploadFileFn
    this.createDocumentFn = createDocumentFn
    this.abortController = new AbortController()
    this.state = this.createInitialState()
  }

  private createInitialState(): UploadQueueState {
    return {
      tasks: [],
      isPaused: false,
      isUploading: false,
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      bytesUploaded: 0,
      totalBytes: 0,
    }
  }

  /** 添加文件到队列 */
  addFiles(files: File[]): UploadTask[] {
    const newTasks: UploadTask[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || this.inferMimeType(file.name),
      status: 'pending',
      progress: 0,
      retryCount: 0,
      createdAt: Date.now(),
    }))

    this.state.tasks.push(...newTasks)
    this.state.totalFiles += newTasks.length
    this.state.totalBytes += newTasks.reduce((sum, t) => sum + t.fileSize, 0)

    return newTasks
  }

  /** 更新任务状态 */
  private updateTask(
    taskId: string,
    updates: Partial<UploadTask>
  ): UploadTask | null {
    const index = this.state.tasks.findIndex((t) => t.id === taskId)
    if (index === -1) return null

    this.state.tasks[index] = { ...this.state.tasks[index], ...updates }
    this.updateCounters()

    return this.state.tasks[index]
  }

  private updateCounters(): void {
    this.state.completedFiles = this.state.tasks.filter(
      (t) => t.status === 'completed'
    ).length
    this.state.failedFiles = this.state.tasks.filter(
      (t) => t.status === 'failed' || t.status === 'cancelled'
    ).length
    this.state.bytesUploaded = this.state.tasks
      .filter((t) => t.status === 'completed' || t.status === 'uploading')
      .reduce((sum, t) => sum + (t.fileSize * t.progress) / 100, 0)
  }

  /** 开始处理队列 */
  async start(datasetId: string): Promise<void> {
    if (this.state.tasks.length === 0) return

    this.state.isUploading = true
    this.paused = false
    this.abortController = new AbortController()

    await this.processQueue(datasetId)
  }

  private async processQueue(datasetId: string): Promise<void> {
    while (this.state.tasks.some((t) => t.status === 'pending')) {
      if (this.abortController.signal.aborted || this.paused) {
        return
      }

      const pendingTasks = this.state.tasks
        .filter((t) => t.status === 'pending')
        .slice(0, this.config.maxConcurrent - this.processingCount)

      if (pendingTasks.length === 0) {
        await this.sleep(100)
        continue
      }

      pendingTasks.forEach((task) => {
        this.processingCount++
        void this.uploadSingleFile(datasetId, task.id)
      })

      await this.sleep(50)
    }

    // 等待剩余上传完成
    while (
      this.state.tasks.some(
        (t) => t.status === 'uploading' || t.status === 'processing'
      )
    ) {
      await this.sleep(100)
      if (this.abortController.signal.aborted || this.paused) {
        return
      }
    }

    this.state.isUploading = false
  }

  private async uploadSingleFile(
    datasetId: string,
    taskId: string
  ): Promise<void> {
    const task = this.state.tasks.find((t) => t.id === taskId)
    if (!task || task.status !== 'pending') return

    try {
      this.updateTask(taskId, { status: 'uploading', progress: 10 })

      // 上传文件
      const fileInfo = await this.uploadFileFn(task.file)

      this.updateTask(taskId, {
        progress: 50,
        fileId: fileInfo.id,
        fileUri: fileInfo.uri,
      })

      // 创建文档记录
      await this.createDocumentFn(datasetId, fileInfo, task.fileName)

      this.updateTask(taskId, { status: 'completed', progress: 100 })
    } catch (error: any) {
      const currentTask = this.state.tasks.find((t) => t.id === taskId)
      if (!currentTask) return

      if (currentTask.retryCount < this.config.maxRetries) {
        // 重试逻辑
        await this.sleep(this.config.retryDelay)
        this.updateTask(taskId, {
          status: 'pending',
          retryCount: currentTask.retryCount + 1,
          error: undefined,
        })
        this.processingCount--
        return
      }

      this.updateTask(taskId, {
        status: 'failed',
        error: error.message || '上传失败',
      })
    }

    this.processingCount--
  }

  /** 暂停队列 */
  pause(): void {
    this.paused = true
    this.state.isPaused = true
    // 将正在上传的任务标记为 paused
    this.state.tasks
      .filter((t) => t.status === 'uploading' || t.status === 'pending')
      .forEach((t) => this.updateTask(t.id, { status: 'paused' }))
  }

  /** 继续队列 */
  resume(datasetId: string): void {
    this.paused = false
    this.state.isPaused = false
    // 恢复暂停的任务
    this.state.tasks
      .filter((t) => t.status === 'paused')
      .forEach((t) =>
        this.updateTask(t.id, {
          status: 'pending',
          progress: t.progress || 0,
        })
      )
    void this.processQueue(datasetId)
  }

  /** 取消队列 */
  cancel(): void {
    this.abortController.abort()
    this.state.isUploading = false
    this.state.isPaused = false
    this.state.tasks
      .filter(
        (t) =>
          t.status === 'pending' ||
          t.status === 'uploading' ||
          t.status === 'processing' ||
          t.status === 'paused'
      )
      .forEach((t) => this.updateTask(t.id, { status: 'cancelled' }))
  }

  /** 重试所有失败的任务 */
  retryFailed(datasetId: string): void {
    this.state.tasks
      .filter((t) => t.status === 'failed')
      .forEach((t) =>
        this.updateTask(t.id, {
          status: 'pending',
          retryCount: 0,
          error: undefined,
        })
      )
    void this.start(datasetId)
  }

  /** 重试单个失败任务 */
  retrySingle(taskId: string, datasetId: string): void {
    const task = this.state.tasks.find((t) => t.id === taskId)
    if (!task || task.status !== 'failed') return

    this.updateTask(taskId, {
      status: 'pending',
      retryCount: 0,
      error: undefined,
    })
    void this.uploadSingleFile(datasetId, taskId)
  }

  /** 从 UI 移除任务（不从服务器删除） */
  removeTask(taskId: string): void {
    const task = this.state.tasks.find((t) => t.id === taskId)
    if (!task) return

    this.state.tasks = this.state.tasks.filter((t) => t.id !== taskId)
    this.state.totalFiles = Math.max(0, this.state.totalFiles - 1)
    this.state.totalBytes = Math.max(
      0,
      this.state.totalBytes - task.fileSize
    )
    if (task.status === 'completed') {
      this.state.completedFiles = Math.max(0, this.state.completedFiles - 1)
    } else if (task.status === 'failed' || task.status === 'cancelled') {
      this.state.failedFiles = Math.max(0, this.state.failedFiles - 1)
    }
  }

  /** 清空已完成/失败的任务 */
  clearFinished(): void {
    const toRemove = this.state.tasks.filter(
      (t) => t.status === 'completed' || t.status === 'cancelled'
    )
    toRemove.forEach((t) => this.removeTask(t.id))
  }

  getState(): UploadQueueState {
    return { ...this.state }
  }

  getTasks(): UploadTask[] {
    return [...this.state.tasks]
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private inferMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      md: 'text/markdown',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
    return mimeTypes[ext || ''] || 'application/octet-stream'
  }
}
