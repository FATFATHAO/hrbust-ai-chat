import type {
  UploadTask,
  UploadQueueState,
  UploadQueueConfig,
  UploadStatus,
  Chunk,
  ReviewInfo,
} from './types'

const DEFAULT_CONFIG: UploadQueueConfig = {
  maxConcurrent: 3,
  maxRetries: 3,
  retryDelay: 1000,
}

// 辅助函数：根据文件名获取文档类型
function getDocumentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const typeMap: Record<string, string> = {
    pdf: "pdf",
    docx: "docx",
    doc: "doc",
    txt: "txt",
    md: "md",
  };
  return typeMap[ext || ""] || "unknown";
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
  ) => Promise<{ upload_url: string; upload_uri: string }>
  private createReviewFn: (
    datasetId: string,
    uploadUri: string,
    documentName: string,
    documentType: string
  ) => Promise<{ dataset_id: string; reviews: ReviewInfo[] }>
  private mgetReviewFn: (
    datasetId: string,
    reviewIds: string[]
  ) => Promise<{ dataset_id: string; reviews: ReviewInfo[] }>
  private getChunksFn: (
    docTreeTosUrl: string
  ) => Promise<{ chunks: Chunk[] }>
  private saveReviewFn: (
    datasetId: string,
    reviewId: string,
    chunks: Chunk[]
  ) => Promise<any>
  private createKnowledgeDocumentFn: (
    datasetId: string,
    name: string,
    tosUri: string,
    reviewId: string
  ) => Promise<{ document_infos: { document_id: string; name: string }[] }>

  constructor(
    config: Partial<UploadQueueConfig>,
    uploadFileFn: (
      file: File
    ) => Promise<{ upload_url: string; upload_uri: string }>,
    createReviewFn: (
      datasetId: string,
      uploadUri: string,
      documentName: string,
      documentType: string
    ) => Promise<{ dataset_id: string; reviews: ReviewInfo[] }>,
    mgetReviewFn: (
      datasetId: string,
      reviewIds: string[]
    ) => Promise<{ dataset_id: string; reviews: ReviewInfo[] }>,
    getChunksFn: (
      docTreeTosUrl: string
    ) => Promise<{ chunks: Chunk[] }>,
    saveReviewFn: (
      datasetId: string,
      reviewId: string,
      chunks: Chunk[]
    ) => Promise<any>,
    createKnowledgeDocumentFn: (
      datasetId: string,
      name: string,
      tosUri: string,
      reviewId: string
    ) => Promise<{ document_infos: { document_id: string; name: string }[] }>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.uploadFileFn = uploadFileFn
    this.createReviewFn = createReviewFn
    this.mgetReviewFn = mgetReviewFn
    this.getChunksFn = getChunksFn
    this.saveReviewFn = saveReviewFn
    this.createKnowledgeDocumentFn = createKnowledgeDocumentFn
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
      // ========== 步骤1: 上传文件 ==========
      this.updateTask(taskId, {
        status: 'uploading',
        progress: 5,
        currentStep: 'upload',
      })

      const fileInfo = await this.uploadFileFn(task.file)

      this.updateTask(taskId, {
        progress: 15,
        uploadUri: fileInfo.upload_uri,
        currentStep: 'create_review',
      })

      // ========== 步骤2: 创建审查 ==========
      const reviewResult = await this.createReviewFn(
        datasetId,
        fileInfo.upload_uri,
        task.fileName,
        getDocumentType(task.fileName)
      )
      const reviewInfo = reviewResult.reviews[0]

      this.updateTask(taskId, {
        progress: 25,
        reviewId: reviewInfo.review_id,
        documentName: reviewInfo.document_name,
        documentType: reviewInfo.document_type,
        tosUrl: reviewInfo.tos_url,
        currentStep: 'get_chunks',
      })

      // ========== 步骤3: 获取审查详情（包含 doc_tree_tos_url）- 带轮询 ==========
      let reviewDetailInfo: ReviewInfo | null = null;
      const maxRetries = 10;
      const retryInterval = 2000; // 2秒

      for (let i = 0; i < maxRetries; i++) {
        const reviewDetail = await this.mgetReviewFn(datasetId, [reviewInfo.review_id]);
        reviewDetailInfo = reviewDetail.reviews[0];

        if (reviewDetailInfo?.doc_tree_tos_url) {
          // 已有 doc_tree_tos_url，跳出轮询
          break;
        }

        if (i < maxRetries - 1) {
          // 还有重试次数，等待后继续
          await this.sleep(retryInterval);
        } else {
          // 达到最大重试次数，抛出错误
          throw new Error("获取文档分片预览超时: 等待 " + (maxRetries * retryInterval / 1000) + " 秒后仍无 doc_tree_tos_url");
        }
      }

      if (!reviewDetailInfo?.doc_tree_tos_url) {
        throw new Error("获取文档分片预览失败: 缺少 doc_tree_tos_url")
      }

      this.updateTask(taskId, {
        docTreeTosUrl: reviewDetailInfo.doc_tree_tos_url,
        previewTosUrl: reviewDetailInfo.preview_tos_url,
        progress: 35,
        currentStep: 'get_chunks',
      })

      // ========== 步骤4: 获取 chunks ==========
      const chunksResult = await this.getChunksFn(reviewDetailInfo.doc_tree_tos_url)

      this.updateTask(taskId, {
        chunks: chunksResult.chunks,
        chunksLoaded: true,
        progress: 50,
        currentStep: 'save_chunks',
      })

      // ========== 步骤5: 保存 chunks ==========
      await this.saveReviewFn(datasetId, reviewInfo.review_id, chunksResult.chunks)

      this.updateTask(taskId, {
        chunksSaved: true,
        progress: 75,
        currentStep: 'create_document',
      })

      // ========== 步骤6: 创建知识库文档 ==========
      const docResult = await this.createKnowledgeDocumentFn(
        datasetId,
        reviewInfo.document_name,
        fileInfo.upload_uri,
        reviewInfo.review_id
      )

      this.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        documentId: docResult.document_infos[0]?.document_id,
        knowledgeDocumentId: docResult.document_infos[0]?.document_id,
      })
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
