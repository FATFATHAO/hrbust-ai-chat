import { createFileRoute } from '@tanstack/react-router'
import KnowledgeBasePage from '@/components/knowledge-base/coze/KnowledgeBase'

export const Route = createFileRoute('/settings/knowledge-base')({
  component: KnowledgeBasePage,
})
