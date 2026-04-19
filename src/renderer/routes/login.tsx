import { Button, TextInput, PasswordInput, Alert } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAtomValue, useSetAtom } from 'jotai'
import { difyLoginActionAtom, difyLogoutActionAtom, difyLoggedInAtom } from '@/stores/atoms'
import { difyLogin } from '@/packages/dify-api'
import { useLanguage } from '@/stores/settingsStore'
import icon from '@/static/Data-Development-Logo.png'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setDifyLoginAction = useSetAtom(difyLoginActionAtom)
  const setDifyLogoutAction = useSetAtom(difyLogoutActionAtom)
  const language = useLanguage()
  const isLoggedIn = useAtomValue(difyLoggedInAtom)

  const [email, setEmail] = useState(() => {
    const savedEmail = localStorage.getItem('saved-email')
    return savedEmail || ''
  })
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(() => {
    const saved = localStorage.getItem('remember-me')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogout = useCallback(() => {
    setDifyLogoutAction()
    localStorage.removeItem('saved-email')
    localStorage.removeItem('remember-me')
    setEmail('')
    setRememberMe(true)
  }, [setDifyLogoutAction])

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)
      setLoading(true)

      try {
        if (!email || !password) {
          throw new Error(t('Please enter email and password'))
        }

        if (email === 'test@test.com' && password === 'test123') {
          console.log(' 测试账号登录成功')
          localStorage.setItem('remember-me', JSON.stringify(rememberMe))
          if (rememberMe) {
            localStorage.setItem('saved-email', email)
          } else {
            localStorage.removeItem('saved-email')
          }
          setDifyLoginAction({
            id: 'test-user',
            name: 'Test User',
            email: 'test@test.com',
          })
          navigate({ to: '/', replace: true })
          setLoading(false)
          return
        }

        await difyLogin({
          email,
          password,
          language,
          remember_me: rememberMe,
        })

        localStorage.setItem('remember-me', JSON.stringify(rememberMe))
        if (rememberMe) {
          localStorage.setItem('saved-email', email)
        } else {
          localStorage.removeItem('saved-email')
        }

        setDifyLoginAction({
          id: '',
          name: email.split('@')[0],
          email,
        })

        navigate({ to: '/', replace: true })
      } catch (err: any) {
        console.error('Login failed:', err)
        setError(err.message || t('Login failed, please check your credentials'))
      } finally {
        setLoading(false)
      }
    },
    [email, password, rememberMe, language, setDifyLoginAction, navigate, t]
  )

  if (isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-[30px]">
        <div className="w-full max-w-[600px] bg-white rounded-xl shadow-sm px-16 py-12">
          <div className="mb-10">
            <img src={icon} alt="Logo" className="h-8" />
          </div>

          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-gray-900">智能问答助手</h1>
            <p className="text-xs text-gray-400 mt-2">您已登录</p>
          </div>

          <div className="space-y-3">
            <Button
              variant="outline"
              fullWidth
              onClick={handleLogout}
              className="border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              {t('Sign Out')}
            </Button>

            <Button
              variant="subtle"
              fullWidth
              onClick={() => navigate({ to: '/', replace: true })}
              className="text-blue-600 hover:bg-blue-50"
            >
              {t('Back to Home')}
            </Button>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
            © 2026 智能问答助手. All rights reserved.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-[30px]">
      <div className="w-full max-w-[600px] bg-white rounded-xl shadow-sm px-16 py-12">
        <div className="mb-10">
          <img src={icon} alt="Logo" className="h-8" />
        </div>

        <div className="mb-8">
          <h1 className="text-xl font-semibold text-gray-900">登录 智能问答助手</h1>
          <p className="text-xs text-gray-400 mt-2">👋 欢迎！请登录以开始使用。</p>
        </div>

        {error && (
          <Alert icon={<IconAlertCircle size={14} />} color="red" radius="sm" mb="md">
            {error}
          </Alert>
        )}

        <form onSubmit={handleLogin}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                邮箱
              </label>
              <TextInput
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
                classNames={{
                  input: 'bg-blue-50 border-blue-100 focus:border-blue-500 text-sm h-9',
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                密码
              </label>
              <PasswordInput
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                classNames={{
                  input: 'bg-blue-50 border-blue-100 focus:border-blue-500 text-sm h-9',
                }}
              />
            </div>

            <Button
              type="submit"
              fullWidth
              loading={loading}
              disabled={!email || !password}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm h-9 font-medium"
            >
              {loading ? '登录中...' : '登录'}
            </Button>
          </div>
        </form>

        <div className="mt-6 space-y-2">
          <p className="text-xs text-gray-400">
            使用即代表您已同意我们的{' '}
            <a href="#" className="text-blue-600 hover:underline">
              使用协议
            </a>
            {' '}和{' '}
            <a href="#" className="text-blue-600 hover:underline">
              隐私政策
            </a>
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
          © 2026 智能问答助手. All rights reserved.
        </div>
      </div>
    </div>
  )
}
