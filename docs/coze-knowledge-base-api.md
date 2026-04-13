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
| GET | `/v1/datasets` | 获取数据集列表（包含 file_list） | ✅ 已实现 |
| DELETE | `/v1/datasets/:dataset_id` | 删除数据集 | ✅ 已实现 |
| POST | `/v1/open_api/knowledge/document/create` | 在数据集中创建文档 | ✅ 已实现 |
| POST | `/v1/open_api/knowledge/document/delete` | 删除文档 | ⚠️ 接口已实现，但暂无法使用（见下文） |

## 必填参数说明

**重要**: Coze 的多个 API 接口要求传递 Space/Project/Knowledge 级别的 ID 作为必填参数，否则会拉取不到数据。

| 参数 | 值 | 说明 |
|------|-----|------|
| space_id | 7626374491127414784 | Coze 空间 ID |
| project_id | 7626374607464824832 | Coze 项目 ID |
| knowledge_ids | 7626400579832512512 | Coze 知识库 ID |

## 接口详细说明

### 1. 获取数据集列表 (listDatasets)

```typescript
async listDatasets(page = 1, size = 20): Promise<{ datasets: Dataset[]; total: number }> {
  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
    space_id: "7626374491127414784",
    project_id: "7626374607464824832",
    knowledge_ids: "7626400579832512512",
  })
  const response = await fetch(`${API_BASE_URL}/v1/datasets?${params}`, {
    method: "GET",
  })
  // ...
}
```

**重要**: 响应中的 `data.dataset_list[].file_list` 包含该数据集的文档文件名列表。

### 2. 删除数据集 (deleteDataset)

```typescript
async deleteDataset(datasetId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/datasets/${datasetId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  // ...
}
```

### 3. 删除文档 (deleteDocuments)

```typescript
async deleteDocuments(datasetId: string, documentIds: string[]): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/open_api/knowledge/document/delete`, {
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
  file_list?: string[]       // 文件名列表，直接从 /v1/datasets 返回
  failed_file_list?: string[] // 失败文件列表
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

## 工作流程

1. 用户创建知识库 → `POST /v1/datasets`
2. 用户选择知识库 → `GET /v1/datasets`，从返回的 `file_list` 获取文档列表
3. 用户上传文档 →
   - `POST /v1/files/upload` 上传文件
   - `POST /v1/open_api/knowledge/document/create` 创建文档记录
   - `GET /v1/datasets` 刷新 `file_list`
4. 用户可删除整个知识库

## 当前实现说明

### 文档列表展示

文档列表直接使用 `GET /v1/datasets` 响应中的 `file_list` 字段。

**表格只显示以下信息**：
- 文档名称

**因 `file_list` 只包含文件名，以下信息暂不显示**：
- 状态（无 document_id 无法查询）
- 切片数（无 document_id 无法查询）
- 上传时间（无 document_id 无法查询）

### 文件删除限制

⚠️ **重要**: 删除文档接口 `POST /v1/open_api/knowledge/document/delete` 代码已实现，但由于 `GET /v1/datasets` 返回的 `file_list` 只包含文件名（字符串数组），不包含 `document_id`，因此无法获取到 document_id 来调用删除文档接口。

如需支持单独删除文档，需要：
1. 后端修改 `file_list` 返回结构，增加 document_id 字段
2. 或新增一个获取文档详情的接口返回 document_id

## Bug 修复记录

### 2026/04/12 - 简化文档获取方式

**问题描述**: 用户反馈文档列表无法正常拉取。

**修复方案**: 发现 `GET /v1/datasets` 的响应中已包含 `file_list` 字段，直接包含文档文件名列表。因此改用 `file_list` 直接展示文档列表，简化了数据获取逻辑。

**涉及文件**: `chatbox/src/renderer/components/knowledge-base/coze/KnowledgeBase.tsx`
