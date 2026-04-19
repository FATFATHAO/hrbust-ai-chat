import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export interface DifyUserProfile {
  id: string
  name: string
  email: string
  avatar?: string
  created_at?: string
}

export const difyLoggedInAtom = atomWithStorage<boolean>('dify-logged-in', false)

export const difyUserProfileAtom = atom<DifyUserProfile | null>(null)

export const difyLoginActionAtom = atom(null, (_get, set, profile: DifyUserProfile) => {
  set(difyLoggedInAtom, true)
  set(difyUserProfileAtom, profile)
})

export const difyLogoutActionAtom = atom(null, (_get, set) => {
  set(difyLoggedInAtom, false)
  set(difyUserProfileAtom, null)
})
