# Coze 知识库 API 实现文档

## 概述

Coze 知识库模块位于 `chatbox/src/renderer/components/knowledge-base/coze/KnowledgeBase.tsx`，通过 BFF 层（端口 48080）与 Coze API 进行对接。

## API 配置

```typescript
const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:48080";
```

## API 端点列表

| 方法 | 路径 | 功能 | 状态 |
|------|------|------|------|
| POST | `/v1/files/upload` | 上传文件到 Coze | ✅ 已实现 |
| POST | `/v1/datasets` | 创建知识库数据集 | ✅ 已实现 |
| GET | `/v1/datasets` | 获取数据集列表 | ✅ 已实现 |
| GET | `/v1/datasets/:dataset_id` | 获取数据集详情 | ✅ 已实现 |
| PUT | `/v1/datasets/:dataset_id` | 更新数据集 | ✅ 已实现 |
| DELETE | `/v1/datasets/:dataset_id` | 删除数据集 | ✅ 已实现 |
| POST | `/open_api/knowledge/document/create` | 在数据集中创建文档 | ✅ 已实现 |
| POST | `/open_api/knowledge/document/list` | 获取文档列表（包含 document_id） | ✅ 已实现 |
| POST | `/open_api/knowledge/document/update` | 更新文档（重命名） | ✅ 已实现 |
| POST | `/open_api/knowledge/document/delete` | 删除文档 | ✅ 已实现 |

## 必填参数说明

**重要**: Coze 的多个 API 接口要求传递 Space/Project/Knowledge 级别的 ID 作为必填参数。

| 参数 | 值 | 说明 |
|------|-----|------|
| space_id | 7626374491127414784 | Coze 空间 ID |
| project_id | 7626374607464824832 | Coze 项目 ID |

## 接口详细说明

### 1. 获取数据集列表 (listDatasets)

**注意**: 后端已更新参数名称 `page` → `page_num`，`size` → `page_size`

```typescript
async listDatasets(page = 1, size = 20): Promise<{ datasets: Dataset[]; total: number }> {
  const params = new URLSearchParams({
    page_num: String(page),      // 注意：后端使用 page_num
    page_size: String(size),     // 注意：后端使用 page_size
    space_id: "7626374491127414784",
    project_id: "7626374607464824832",
  })
  const response = await fetch(`${API_BASE_URL}/v1/datasets?${params}`, {
    method: "GET",
  })
  // ...
}
```

**响应结构**:
```typescript
{
  BaseResp: null,
  code: 0,
  data: {
    dataset_list: [Dataset],
    total_count: number
  },
  msg: string
}
```

### 2. 获取文档列表 (listDocuments)

**重要**: 此接口返回包含 `document_id` 的完整文档信息，是文档管理功能的基础。

```typescript
async listDocuments(datasetId: string, page = 1, size = 50): Promise<{ documents: Document[]; total: number }> {
  const response = await fetch(`${API_BASE_URL}/open_api/knowledge/document/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataset_id: datasetId,
      page,
      size,
    }),
  })
  // ...
}
```

### 3. 删除文档 (deleteDocuments)

```typescript
async deleteDocuments(datasetId: string, documentIds: string[]): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/open_api/knowledge/document/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataset_id: datasetId,
      document_ids: documentIds,
    }),
  })
  // ...
}
```

### 4. 更新文档 (updateDocument)

用于文档重命名等操作。

```typescript
async updateDocument(datasetId: string, documentId: string, documentName: string): Promise<Document> {
  const response = await fetch(`${API_BASE_URL}/open_api/knowledge/document/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataset_id: datasetId,
      document_id: documentId,
      document_name: documentName,
    }),
  })
  // ...
}
```

## 数据结构

### Dataset (数据集)

```typescript
interface Dataset {
  dataset_id: string
  name: string
  description?: string
  doc_count?: number
  slice_count?: number
  char_count?: number
  status?: number
  create_time?: number
  update_time?: number
  icon_url?: string
  icon_uri?: string
  creator_id?: string
  creator_name?: string
  format_type?: number
  storage_location?: number
  space_id?: string
  file_list?: string[]
  failed_file_list?: string[]
}
```

### Document (文档)

```typescript
interface Document {
  document_id: string   // 文档唯一标识符
  name: string          // 文档名称
  status: number        // 状态码
  slice_count: number   // 切片数量
  char_count: number    // 字符数
  size: number          // 文件大小（字节）
  type: string          // 文件类型（如 pdf, docx）
  create_time: number   // 创建时间戳
  update_time?: number  // 更新时间戳
  status_descript?: string  // 状态详细描述（如错误信息）
  source_file_id?: string   // 源文件ID
}
```

## 状态码映射

### 数据集状态 (Dataset Status)

| 状态值 | 前端显示 | 说明 |
|--------|----------|------|
| 0 | parsing | 处理中 |
| 1 | completed | 就绪/可用 |
| 2 | error | 已删除 |
| 3 | error | 禁用 |
| 9 | error | 失败 |

### 文档状态 (Document Status)

| 状态值 | 前端显示 | 说明 |
|--------|----------|------|
| 0 | 处理中 | 处理中 |
| 1 | 已完成 | 已完成/可用 |
| 2 | 已禁用 | 已禁用 |
| 3 | 已删除 | 已删除 |
| 4 | 重新切片中 | 重新切片中 |
| 5 | 刷新中 | 刷新中 |
| 9 | 失败 | 处理失败 |

## 工作流程

### 创建知识库
1. 用户点击"新建知识库" → `POST /v1/datasets`

### 上传文档
1. 用户选择知识库 → `GET /v1/datasets` + `POST /open_api/knowledge/document/list`
2. 用户上传文件 → `POST /v1/files/upload` 上传文件
3. 创建文档记录 → `POST /open_api/knowledge/document/create`
4. 刷新文档列表 → `POST /open_api/knowledge/document/list`

### 管理文档
1. 用户选择知识库 → 自动获取文档列表（包含 document_id）
2. 可执行操作：
   - 重命名文档 → `POST /open_api/knowledge/document/update`
   - 删除文档 → `POST /open_api/knowledge/document/delete`

### 删除知识库
1. 用户点击删除 → `DELETE /v1/datasets/:dataset_id`

## 前端组件状态

| 状态变量 | 类型 | 说明 |
|----------|------|------|
| datasets | Dataset[] | 知识库列表 |
| selectedDataset | Dataset \| null | 当前选中的知识库 |
| documents | Document[] | 当前知识库的文档列表 |
| documentsLoading | boolean | 文档列表加载状态 |
| documentsTotal | number | 文档总数 |

## 文档状态轮询机制

### 实现位置
`src/renderer/components/knowledge-base/coze/KnowledgeBase.tsx` 第 617-632 行

### 轮询逻辑
上传文档后，Coze API 会异步处理文档（status=0 表示处理中）。前端通过轮询机制自动刷新文档状态：

```typescript
// 文档处理状态轮询 - 当有文档处于处理中状态时持续刷新
useEffect(() => {
  if (!selectedDataset?.dataset_id) return;

  // 检查是否有处理中的文档 (status=0)
  const hasProcessingDocs = documents.some((doc) => doc.status === 0);

  if (!hasProcessingDocs) return;

  // 每 2 秒刷新一次文档列表，直到没有处理中的文档
  const pollInterval = setInterval(() => {
    fetchDocuments(selectedDataset.dataset_id, true);
  }, 2000);

  return () => clearInterval(pollInterval);
}, [selectedDataset?.dataset_id, documents]);
```

### 行为说明
- 当知识库中存在任意文档的 `status === 0`（处理中）时，每 2 秒自动调用 `fetchDocuments` 刷新文档列表
- 当所有文档都变为终态（已完成/已禁用/已删除/失败）时，轮询自动停止
- 切换知识库时，如果新知识库没有处理中的文档，轮询不会启动

### 与本地知识库的区别
本地知识库（`KnowledgeBaseDocuments.tsx`）同样有 2 秒轮询机制，但检查的状态包括 `pending`、`processing`、`paused`，轮询实现方式一致。

## 辅助函数

```typescript
// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// 格式化时间戳
const formatDate = (timestamp: number): string => {
  if (!timestamp) return "-";
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
```

## API 路径说明

**重要**: `open_api` 路由直接挂载在根路径下，不在 `/v1` 下。

| 前端路径 | 后端实际路径 |
|----------|-------------|
| `/v1/datasets` | `/v1/datasets` ✅ |
| `/open_api/knowledge/document/*` | `/open_api/knowledge/document/*` ✅ |

## 更新日志

### 2026/04/13 - 后端 API 参数更新

**后端变更**:
- `ListDatasets` PATCH → PUT
- `ListDatasetsRequest`: `page` → `page_num`, `size` → `page_size`
- `ListDatasetsRequest`: 移除 `knowledge_ids`, `OrderField`, `OrderType`, `StorageLocation`
- `ListDatasetsRequest`: 新增 `FormatType`
- `ListDatasetsResponse`: 响应结构调整为 `data.dataset_list`, `data.total_count`
- `UpdateDatasetRequest`: 移除 `DatasetID`, `IconURI`, `Status`，新增 `FileID`

**前端更新**:
- `listDatasets` 参数更新: `page` → `page_num`, `size` → `page_size`
- 移除 `knowledge_ids` 参数

### 2026/04/13 - 完善文档管理功能

**新增功能**:
- `listDocuments` API 对接 - 获取完整文档列表（包含 document_id）
- `updateDocument` API 对接 - 文档重命名功能
- 文档状态显示 - Badge 组件展示处理状态
- 文档切片数、大小、上传时间显示
- 删除文档功能修复 - 现可正常删除单个文档
- 上传按钮启用

**修复问题**:
- 原 `file_list` 只返回文件名字符串，无法获取 document_id
- 现通过 `listDocuments` API 获取完整文档信息

**涉及文件**:
- `chatbox/src/renderer/components/knowledge-base/coze/KnowledgeBase.tsx`
