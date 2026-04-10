# Excel 分析功能集成文档

## 概述

将 ExcelMind 的 Excel 数据分析能力集成到 chatbox 项目中，采用前后端分离架构：
- **前端**: chatbox 的 React 页面，负责 UI 交互
- **后端**: ExcelMind 的 FastAPI 服务，负责数据处理和 LLM Agent

## 技术栈

| 层级 | 技术 |
|---|---|
| 路由 | TanStack Router (文件路由自动生成) |
| UI 框架 | Mantine UI + Tailwind CSS |
| 图标 | @tabler/icons-react |
| 图表 | echarts ^5.5.1 |
| 文件上传 | @mantine/dropzone ^7.17.7 |
| Markdown | react-markdown (已有) |

## 文件变更

### 新建文件

```
src/renderer/
├── routes/excel/index.tsx          # Excel 分析页面主路由
└── components/excel/
    └── ChartRenderer.tsx          # ECharts 图表渲染组件
```

### 修改文件

| 文件 | 修改内容 |
|---|---|
| `Sidebar.tsx` | 添加 `IconTableShortcut` 图标，添加"Excel 分析"导航入口 |
| `package.json` | 添加 `echarts` 和 `@mantine/dropzone` 依赖 |
| `src/main/main.ts` | 添加 `AppUpdater` 导入（修复构建错误） |
| `src/renderer/components/excel/ChartRenderer.tsx` | 使用 `useComputedColorScheme` 替代 `useColorScheme` |

## 核心实现

### 1. 页面路由结构 (`routes/excel/index.tsx`)

**布局**: 左侧表格列表 + 右侧对话区域

```
┌──────────────────┬─────────────────────────────────┐
│  上传区域        │  Header: 当前活跃表指示器        │
│  (Dropzone)     ├─────────────────────────────────┤
│                 │                                  │
│  数据表列表      │  对话消息区域                    │
│  - 表1 [选中]   │  - User Message                 │
│  - 表2          │  - Thinking Block (思考过程)     │
│                 │  - Tool Call Block (工具调用)    │
│                 │  - Assistant Message             │
│                 │                                  │
│                 ├─────────────────────────────────┤
│                 │  输入框 + 发送按钮               │
└──────────────────┴─────────────────────────────────┘
```

**关键组件**:
- `TableInfo` - 表格元信息接口
- `ChatMessage` - 对话消息接口
- `ToolCall` - 工具调用状态
- `StreamEvent` - SSE 事件类型

### 2. SSE 流式对话

ExcelMind 后端返回的 SSE 事件类型：

| 事件类型 | 说明 | 前端处理 |
|---|---|---|
| `thinking` | LLM 思考过程 | 实时显示在 Thinking Block |
| `thinking_done` | 思考结束 | 标记 thinkingFinished = true |
| `clear_thinking` | 清除思考 | 清空思考内容 |
| `tool_call` | 调用工具 | 显示工具调用块 (filter_data 等) |
| `tool_result` | 工具结果 | 格式化并显示结果 |
| `token` | 输出 token | 追加到消息内容 |
| `done` | 完成 | 最终消息内容 |
| `table_info` | 切换活跃表 | 更新 activeTableId |
| `error` | 错误 | 显示错误信息 |

### 3. 工具名称映射

```typescript
const toolNames = {
  filter_data: '数据筛选',
  aggregate_data: '数据聚合',
  group_and_aggregate: '分组统计',
  sort_data: '数据排序',
  search_data: '数据搜索',
  get_column_stats: '列统计',
  get_unique_values: '获取唯一值',
  get_data_preview: '数据预览',
  get_current_time: '获取时间',
  calculate: '数学计算',
  generate_chart: '生成图表',
}
```

### 4. 图表渲染 (`ChartRenderer.tsx`)

复用 ExcelMind 前端的 ECharts 渲染逻辑：

```typescript
// 动态导入 echarts
const echarts = await import('echarts')

// 初始化图表
const chart = echarts.init(container, colorScheme === 'dark' ? 'dark' : 'light')
chart.setOption(chartConfig)

// 响应式
const resizeObserver = new ResizeObserver(() => chart.resize())
```

**亮色/暗色主题适配**: `applyThemeOverrides()` 函数处理颜色覆盖

### 5. API 连接

**环境变量**: `VITE_EXCEL_API_URL`，默认 `http://localhost:8000`

| API | 方法 | 说明 |
|---|---|---|
| `/status` | GET | 获取已上传表格列表 |
| `/upload` | POST | 上传 Excel 文件 |
| `/tables/{id}` | DELETE | 删除表格 |
| `/chat/stream` | POST | SSE 流式对话 |

## 后端接口详情

### POST /chat/stream

**请求体**:
```json
{
  "message": "这个表有多少行？",
  "history": [
    { "role": "user", "content": "...", "tableName": "file.xlsx" }
  ]
}
```

**响应**: SSE 流，格式 `data: {...}\n\n`

**工具结果格式** (`tool_result`):
```json
{
  "type": "tool_result",
  "name": "filter_data",
  "result": {
    "total_rows": 100,
    "returned_rows": 20,
    "columns": ["name", "age"],
    "data": [...]
  }
}
```

**图表结果格式**:
```json
{
  "type": "tool_result",
  "name": "generate_chart",
  "result": {
    "chart": { /* ECharts 配置 */ },
    "chart_type": "bar",
    "message": "已生成柱状图，共 20 个数据点"
  }
}
```

## 已知问题与修复

### 6. 流式响应"复读机"问题（疯狂重复显示）

**问题描述**: SSE 流式响应时，页面出现"为了获取...为了获取..."这种指数级增长的复读内容，或者页面看起来像死机了一样不显示任何内容。

**原因分析**:
1. 原代码使用 `indexOf('\n\n')` 在 while 循环中查找 SSE 消息边界，当数据包被截断或包含多个 `\n\n` 时，会导致同一段 buffer 内容被反复处理
2. 在 while 循环中使用 `await handleStreamEvent()` 会阻塞循环，导致 React 渲染引擎挂起
3. `setMessages` 在高频调用时没有做变更检测，每次都触发重渲染，最终 UI 假死

**修复方案**:
1. 使用"行扫描法"替代 `indexOf('\n\n')` 循环：按 `\n` 分割，保留最后一行（可能不完整）到累加器
2. 移除 `handleStreamEvent` 前的 `await`，防止阻塞
3. 在 `handleStreamEvent` 的 `token` case 中添加空值检测：如果 `event.content` 为空则跳过更新

**修改文件**: `src/renderer/routes/excel/index.tsx`

**核心代码变更**:

```typescript
// 旧代码（有问题）
if (reader) {
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const line = buffer.slice(0, boundary).trim()
      buffer = buffer.slice(boundary + 2)
      if (line.startsWith('data: ')) {
        const event: StreamEvent = JSON.parse(line.slice(6))
        await handleStreamEvent(event, assistantMsgId) // 阻塞 + 频繁更新
      }
      boundary = buffer.indexOf('\n\n')
    }
  }
}

// 新代码（修复后）
if (reader) {
  let accumulatedBuffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    accumulatedBuffer += decoder.decode(value, { stream: true })
    const lines = accumulatedBuffer.split('\n')
    accumulatedBuffer = lines.pop() || '' // 保留最后一行
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue
      try {
        const event: StreamEvent = JSON.parse(trimmedLine.slice(6))
        handleStreamEvent(event, assistantMsgId) // 不 await
      } catch (e) {
        console.warn('[SSE解析跳过]', trimmedLine)
      }
    }
  }
}
```

### 4. 流式响应中 NaN 值导致 JSON 解析错误

**问题描述**: SSE 流式响应中包含 `NaN` 值时，前端解析 JSON 报错 `"There was an error parsing the body"`

**原因**: `NaN` (Not a Number) 不是有效的 JSON 格式，但 Pandas 处理空单元格时会生成 `NaN` 值。`CustomJSONEncoder` 虽然处理了 `NaT` 和 `<NA>`，但没有处理 `NaN`

**修复**: 在 `CustomJSONEncoder` 中添加 `NaN` 处理
```python
# 处理 NaN (Not a Number)
if str(obj) in ('nan', 'NaN'):
    return None
```

**修改文件**:
- `src/excel_agent/api.py`
- `src/excel_agent/stream.py`
- `src/excel_agent/stream_backup.py`

### 5. 流式消息不显示（缺少占位符）

**问题描述**: 发送消息后，SSE 流正常返回，但页面上不显示助手消息

**原因**:
1. 助手消息占位符从未被添加到 `messages` 数组，导致 `prev.map()` 找不到 ID
2. 行切分逻辑 `buffer.split('\n\n')` 不够健壮

**修复**:
1. 在发送请求前同时添加用户消息和助手占位符
2. 使用 `indexOf('\n\n')` 替代 `split('\n\n')` 进行行切分
3. 添加 SSE 解析失败的错误日志

**修改文件**: `src/renderer/routes/excel/index.tsx`

### 1. ChartRenderer.tsx 中 useColorScheme 导入错误

**问题描述**: 构建时提示 `"useColorScheme" is not exported by "@mantine/core"`

**原因**: Mantine v7 中 `useColorScheme` 不是直接导出的，需要使用 `useComputedColorScheme`

**修复**:
```typescript
// 错误导入
import { useColorScheme } from '@mantine/core'
const colorScheme = useColorScheme()

// 正确导入
import { useComputedColorScheme } from '@mantine/core'
const colorScheme = useComputedColorScheme('light')
```

### 2. main.ts 中 AppUpdater 未导入

**问题描述**: 运行时报错 `ReferenceError: AppUpdater is not defined`

**原因**: `src/main/main.ts` 使用了 `AppUpdater` 类但未导入

**修复**: 在 `src/main/main.ts` 添加导入:
```typescript
import { AppUpdater } from './app-updater'
```

### 3. Node 版本要求

**问题描述**: pnpm 报 `Unsupported environment (bad pnpm and/or Node.js version)`

**要求**: Node.js >=20.0.0 <23.0.0

**解决方案**: 使用 nvm 切换到兼容版本
```bash
source /usr/share/nvm/nvm.sh
nvm use 20.20.1
```

## 后续扩展

### 可添加的功能

1. **多表连接 UI** - 参考 ExcelMind 的 Join Modal
2. **知识库集成** - 调用 `/knowledge/*` API
3. **表结构详情** - 点击表格显示列信息
4. **导入设置** - 选择工作表、预览行数等

### 样式调整

如需调整页面宽度，修改 `routes/excel/index.tsx` 中的：
```typescript
<Box w={280} ...>  // 左侧边栏宽度
```

### 路由调整

当前路由为 `/excel`，如需改为 `/excel-analysis`，修改：
```typescript
export const Route = createFileRoute('/excel/')({  // 改为 '/excel-analysis/'
  component: ExcelPage,
})
```

## 已知限制

1. **CORS**: 需要 ExcelMind 后端配置 CORS 允许 chatbox 域名
2. **认证**: 未实现会话保持和认证机制
3. **错误处理**: 简化版错误处理，生产环境需增强
