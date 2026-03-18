import KnowledgeBasePage from '@/components/knowledge-base/dify/KnowledgeBase'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/knowledge-base')({
  component: RouteComponent,
})

// 路由页面的本体
function RouteComponent() {
  return (
    <div className="w-full h-full bg-chatbox-background-primary overflow-hidden">
      <KnowledgeBasePage />
    </div>
  )
}
