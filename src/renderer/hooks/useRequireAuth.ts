import { useAtomValue } from 'jotai'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { difyLoggedInAtom } from '@/stores/atoms'

export function useRequireAuth() {
  const isLoggedIn = useAtomValue(difyLoggedInAtom)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoggedIn) {
      navigate({ to: '/login', replace: true })
    }
  }, [isLoggedIn, navigate])

  return isLoggedIn
}
