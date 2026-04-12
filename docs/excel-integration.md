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

## 更新记录

### 2026-04-11

#### 功能更新

1. **修复 Menu.Dropdown 滚动问题**
   - **问题**: 当工作表数量很多时，Menu.Dropdown 下拉菜单无法滚动，导致选不到下方的选项
   - **修复**: 给 `Menu.Dropdown` 添加 `style={{ maxHeight: 300, overflowY: 'auto' }}` 限制最大高度并启用滚动
   - **修改文件**: `src/renderer/routes/excel/index.tsx`

2. **添加清空所有表格功能**
   - **功能**: 点击垃圾桶图标后新增下拉菜单，可选择"清空所有"一次性删除所有已上传的 Excel 文件
   - **实现**: 调用 `POST /session/reset` API 重置 session
   - **修改文件**: `src/renderer/routes/excel/index.tsx`

3. **添加选择删除功能**
   - **功能**: 点击垃圾桶图标后选择"选择删除"，弹出 Modal 界面勾选要删除的表格
   - **实现**: 新增 `deleteSelectModalOpen` 和 `selectedDeleteIds` state，新增 `handleDeleteSelectedTables` 函数
   - **修改文件**: `src/renderer/routes/excel/index.tsx`

4. **修复多工作表上传重复问题**
   - **问题**: 上传多工作表 Excel 文件时，后端会预加载第一个工作表，前端弹出选择框。但点击选择后，第一个表会重复出现在列表中
   - **原因**: 上传响应返回的 `tables` 中已包含第一个表，选择其他表时后端返回的列表包含多个表，导致重复
   - **修复**:
     - `pendingSheets` state 新增 `preloadedTables` 和 `preloadedTableId` 字段存储预加载数据
     - 多工作表时**不立即**调用 `setTables`，等用户选择后再添加
     - 用户选择第一个表时直接使用预加载数据（不重复上传）
     - 用户选择其他表时才上传 `?sheet_name=xxx`
     - 关闭弹窗时默认加载预加载的第一个表
   - **修改文件**: `src/renderer/routes/excel/index.tsx`

5. **修复切换工作表后 sheet_name 不更新问题**
   - **问题**: 点击下拉菜单切换工作表后，列表中显示的工作表名称没有立即更新
   - **修复**: 在 `handleSwitchSheet` 中确保 `setTables` 后调用 `setActiveTableId` 更新状态，并在后端返回的 `tables` 中查找对应表格确认更新
   - **修改文件**: `src/renderer/routes/excel/index.tsx`

6. **添加历史会话功能**
   - **功能**: 自动保存对话历史，支持跨会话加载和手动删除
   - **存储方式**: JSON 文件（`data/sessions/{session_id}/history.json`），契合现有 session 管理架构
   - **自动加载**: 打开页面时自动加载上次会话的对话历史
   - **手动管理**: 点击历史图标可查看所有会话，选择加载或删除
   - **API 端点**:
     - `GET /session/history` - 获取当前 session 的对话历史
     - `POST /session/history` - 保存对话历史
     - `GET /sessions` - 列出所有会话（带元信息）
     - `DELETE /sessions/{session_id}` - 删除指定会话
   - **修改文件**:
     - `src/excel_agent/history_manager.py` (新增)
     - `src/excel_agent/api.py` (新增 API 端点)
     - `src/renderer/routes/excel/index.tsx` (前端历史功能)

7. **添加流式对话中断功能**
   - **功能**: 用户可以随时中断正在生成的 AI 回复
   - **实现**:
     - 后端使用 `asyncio.Event` 作为全局取消标志
     - `stream_chat` 函数在每次 yield 前检查取消标志
     - 新增 `POST /chat/cancel` 端点设置取消标志
     - 前端使用 `reader.cancel()` 中断 SSE 流
     - 发送按钮在处理中变为取消按钮
   - **API 端点**: `POST /chat/cancel` - 取消当前流式对话
   - **修改文件**:
     - `src/excel_agent/stream.py` (添加取消事件机制)
     - `src/excel_agent/api.py` (添加取消端点)
     - `src/renderer/routes/excel/index.tsx` (前端取消功能)

8. **添加全新对话功能**
   - **功能**: 点击按钮清空当前对话，开始新的分析对话
   - **实现**: 新增 `handleNewConversation` 函数，点击 `+` 图标清空消息、思考状态、工具调用状态
   - **位置**: 输入框左侧的 `+` 图标按钮
   - **修改文件**: `src/renderer/routes/excel/index.tsx`

9. **添加自动跟随底部功能**
   - **功能**: 当用户在查看最新消息时自动跟随底部；当用户滚动到上方查看历史时停止自动滚动
   - **实现**:
     - 添加 `autoScroll` 状态控制是否自动滚动
     - `handleMessagesScroll` 检测滚动位置，距离底部 < 100px 时开启自动滚动
     - `scrollToBottom` 仅在 `autoScroll` 为 true 时才执行
   - **修改文件**: `src/renderer/routes/excel/index.tsx`

10. **修复历史记录保存/加载功能**
    - **问题**: 历史记录保存后无法正确加载，消息丢失
    - **原因**: `messages` 状态通过闭包捕获，在异步操作中可能不是最新值；`saveHistory` 和 `handleSendMessage` 都直接使用 `messages` 闭包值
    - **修复**:
      - 添加 `messagesRef` 保存消息引用
      - 添加 `useEffect` 同步 `messages` 到 `messagesRef`
      - `saveHistory` 使用 `messagesRef.current` 获取最新消息
      - `handleSendMessage` 发送历史时使用 `messagesRef.current`
      - `loadHistory` 加载后同步 `messagesRef.current = data.messages`
    - **修改文件**: `src/renderer/routes/excel/index.tsx`

11. **修复自动跟随底部功能**
    - **问题**: 滚动检测不生效，无法自动跟随
    - **原因**: Mantine ScrollArea 的滚动在内部 viewport 上，原来的 `chatContainerRef` 指向根元素而非可滚动元素
    - **修复**:
      - 使用 `viewportRef` 获取 ScrollArea 的可滚动 viewport 引用
      - `scrollToBottom` 直接设置 `scrollTop = scrollHeight`
      - 滚动监听器绑定到 `scrollViewportRef.current`
    - **修改文件**: `src/renderer/routes/excel/index.tsx`

12. **修复历史记录会话切换竞态条件**
    - **问题**: 快速切换会话时，历史记录被覆盖或混淆
    - **原因**:
      - `setSessionId` 是非阻塞的，请求在其完成前就开始发送
      - `messagesRef` 没有在切换时立即清空
      - `saveHistory` 可能使用错误的 sessionId
    - **修复**:
      - 添加 `sessionIdRef` 保存当前 session ID，`loadSession` 时立即更新
      - 添加 `saveInProgressRef` 追踪正在进行的保存操作
      - `loadSession` 开始前等待之前的保存完成
      - 切换会话时立即清空 `messagesRef.current` 和 `setMessages([])`
      - 加载历史后同步 `messagesRef.current = loadedMessages`
    - **修改文件**: `src/renderer/routes/excel/index.tsx`

13. **修复历史记录被刷新覆盖问题（核心架构修复）**
    - **问题**: 刷新页面后 React 状态重置为空数组 `[]`，用户可以在历史加载完成前发消息，导致只保存空状态的 2 条消息，覆盖后端完整历史
    - **原因**: 前端是"失忆的老板"，后端是"盲从的管理员"——刷新后前端失忆，后端收到全量覆盖请求就把厚厚一本档案扔进碎纸机
    - **修复**:
      - 添加 `historyLoaded` 状态，追踪历史是否已加载完成
      - `loadHistory` 的 `finally` 块中设置 `setHistoryLoaded(true)`，无论成功失败都要解锁输入
      - `loadSession` 切换会话时先 `setHistoryLoaded(false)` 锁定输入，加载完后 `finally` 中解锁
      - `TextInput` 和发送按钮的 `disabled` 条件增加 `!historyLoaded`
      - 确保历史记录加载完成后，才允许用户输入
    - **修改文件**: `src/renderer/routes/excel/index.tsx`

14. **后端历史保存改为增量追加（防御性编程）**
    - **问题**: `history.json` 只保存了当次对话的 2 条消息，刷新后历史被覆盖
    - **原因**: 前端 `messagesRef.current` 在某些情况下（可能是时序问题）只包含当次对话消息，后端全量覆盖导致历史丢失
    - **修复**:
      - `history_manager.py` 的 `save_history` 改为**增量追加**而非全量覆盖
      - 保存前先读取本地已有消息，按 `id` 去重，只追加不存在的新消息
      - 即使前端漏发，后端已有消息也不会被覆盖
    - **修改文件**: `src/excel_agent/history_manager.py`

15. **修复全新对话按钮未创建新 session 的问题**
    - **问题**: 点击 `➕` 开启全新对话后，新对话被追加到同一 session，刷新后两条对话合并为一条
    - **原因**: `handleNewConversation` 只清空了前端 UI 状态，没有创建新 session
    - **修复**:
      - `handleNewConversation` 调用 `generateSessionId()` 创建新 session
      - 更新 `localStorage` 的 `SESSION_ID_KEY` 和 `sessionIdRef`
      - 重置 `historyLoaded = false`，等新 session 的历史加载完成后再解锁输入
      - 调用 `loadHistory()` 加载新 session 的历史（新 session 无历史，直接解锁）
      - 添加 `setTables([])` 和 `setActiveTableId(null)` 清空文件列表
      - 调用 `POST /reset` 清空后端 loader，避免历史文件被拉取到新 session
    - **修改文件**: `src/renderer/routes/excel/index.tsx`

16. **修复多工作表选择后重复上传导致出现两个表的问题**
    - **问题**: 上传多工作表 Excel 文件后，弹窗选择非第一个工作表，结果出现两个表
    - **原因**:
      - 上传时后端预加载第一个 Sheet 到 loader，返回 `preloadedTables`
      - 用户选择非第一个 Sheet 时，原代码重新 `POST /upload?sheet_name=xxx` 上传文件
      - 后端 `loader.add_table()` 以追加模式又添加了一个表，导致 loader 中有 2 个表
    - **修复**:
      - 选择非第一个工作表时，调用 `POST /tables/{tableId}/switch-sheet` 切换到对应 Sheet（不重复上传）
      - 只切换 loader 中已有表的活跃 Sheet，避免重复添加
    - **修改文件**: `src/renderer/routes/excel/index.tsx`

17. **修复历史会话切换后 sheet_name 不匹配的问题**
    - **问题**: 不同历史会话中同一文件分析了不同的 sheet，但切换会话后 sheet_name 没有变化，无法展示当前分析的是哪个表
    - **原因**: 后端 loader 是全局单例，不区分 session。`GET /status` 返回的是 loader 当前状态，而非切换目标 session 的状态。没有记录每个 session 的活跃表和活跃 sheet 信息
    - **修复**:
      - `SessionInfo` 新增 `active_table_id` 和 `active_sheet_name` 字段
      - `SessionManager` 新增 `_get_metadata_path`、`_load_session_metadata`、`_save_session_metadata`、`update_active_table`、`get_active_table_info` 方法，将 session 元数据持久化到 `data/sessions/{session_id}/metadata.json`
      - 新增 `POST /session/{session_id}/load` 接口：重置 loader、从 session 文件目录重新加载所有文件、设置活跃表和活跃 sheet
      - `upload_excel`、`switch_table_sheet`、`set_active_table` 接口调用后更新 session 元数据
      - 前端 `loadSession` 改用 `POST /session/{session_id}/load` 加载 session 状态
    - **修改文件**:
      - `src/excel_agent/session_manager.py`
      - `src/excel_agent/api.py`
      - `src/renderer/routes/excel/index.tsx`

18. **修复切换工作表后 UI 显示的表名称没有变化的问题**
    - **问题**: 在下拉框选择其他工作表后，"当前表:"区域显示的表名称没有改变
    - **原因**: UI 只显示 `filename`（文件名），没有显示 `sheet_name`（工作表名称）。用户切换的是工作表，但 UI 显示的是文件名，所以看起来"表名称没变"
    - **修复**: 将 UI 中"当前表:"区域从只显示 `{filename}` 改为显示 `{filename} - {sheet_name}`
    - **修改文件**: `src/renderer/routes/excel/index.tsx`

19. **修复选择历史记录后表名称没有恢复的问题**
    - **问题**: 加载历史会话后，即使该会话之前分析的是不同的工作表，UI 显示的 sheet_name 也没有变化
    - **原因**: `load_session_state` 重新加载文件时调用 `loader.add_table(file_path, None)`，没有传入保存的 sheet_name，导致所有文件都加载第一个工作表，而不是原来保存的那个 sheet。同时 metadata 中也没有保存每个文件对应的 sheet_name
    - **修复**:
      - `SessionInfo` 新增 `_file_sheets` 和 `_file_infos` 字段，用于保存每个文件的 sheet_name 和 filename
      - `SessionManager` 新增 `update_file_info`、`get_file_info`、`get_all_file_infos` 方法，保存每个文件的完整信息到 `metadata.json`
      - `upload_excel` 时保存文件的 filename 和 sheet_name 到 metadata
      - `switch_table_sheet` 时更新该文件的 sheet_name 到 metadata
      - `load_session_state` 时从 metadata 获取每个文件对应的 sheet_name，加载时使用正确的 sheet
    - **修改文件**:
      - `src/excel_agent/session_manager.py`
      - `src/excel_agent/api.py`

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
