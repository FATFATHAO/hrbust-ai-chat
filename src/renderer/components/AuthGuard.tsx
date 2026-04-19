import { useAtomValue } from 'jotai'
import { Navigate } from '@tanstack/react-router'
import { ReactNode } from 'react'
import { difyLoggedInAtom } from '@/stores/atoms'

interface AuthGuardProps {
  children: ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const isLoggedIn = useAtomValue(difyLoggedInAtom)

  if (!isLoggedIn) {
    return <Navigate to="/login" />
  }

  return <>{children}</>
}
