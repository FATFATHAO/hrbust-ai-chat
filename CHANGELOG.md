# Changelog

## [Unreleased]

### Changed

- **hrbust provider**: 更新 API 地址从本地 `127.0.0.1` 切换到服务器域名 `ai.yuecin.com`
  - website: `http://127.0.0.1:40010` → `https://ai.yuecin.com`
  - apiHost: `http://127.0.0.1:48080/v1` → `http://ai.yuecin.com:48080/v1`

- **KnowledgeBase (Coze RAG)**: 修复 API_BASE_URL 配置错误
  - 错误地址 `http://ai.yuecin.com:40011/api` → 正确地址 `http://ai.yuecin.com:48080/v1`
  - 之前路径多了一层 `/api`，导致所有 `/v1/...` 接口 404