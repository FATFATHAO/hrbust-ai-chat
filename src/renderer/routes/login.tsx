import { Button, TextInput, PasswordInput, Alert } from '@mantine/core'
import { IconAlertCircle, IconShieldLock, IconRobot } from '@tabler/icons-react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAtomValue, useSetAtom } from 'jotai'
import { difyLoginActionAtom, difyLogoutActionAtom, difyLoggedInAtom } from '@/stores/atoms'
import { difyLogin } from '@/packages/dify-api'
import { useLanguage } from '@/stores/settingsStore'
import icon from '@/static/Data-Development-Logo.png'
import login_icon from '@/static/Login-Logo.png'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

const animatedLineStyle = `
  @keyframes float1 {
    0%, 100% { transform: translateX(0) translateY(0); }
    50% { transform: translateX(50px) translateY(-30px); }
  }
  @keyframes float2 {
    0%, 100% { transform: translateX(0) translateY(0); }
    50% { transform: translateX(-40px) translateY(40px); }
  }
  @keyframes float3 {
    0%, 100% { transform: translateX(0) translateY(0); }
    50% { transform: translateX(60px) translateY(20px); }
  }
  @keyframes dash {
    to { stroke-dashoffset: -100; }
  }
  @keyframes pulse-glow {
    0%, 100% { opacity: 0.2; filter: drop-shadow(0 0 3px rgba(59, 130, 246, 0.3)); }
    50% { opacity: 0.5; filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.5)); }
  }
`

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

  // 如果已登录，自动跳转到主页
  useEffect(() => {
    if (isLoggedIn) {
      navigate({ to: '/', replace: true })
    }
  }, [isLoggedIn, navigate])

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
      <div className="relative flex items-center justify-center min-h-screen overflow-hidden" style={{
        background: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 25%, #f5f7ff 50%, #eef2ff 75%, #f0f4ff 100%)',
      }}>
        <style>{animatedLineStyle}</style>

        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="lineGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lineGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lineGrad3" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,150 Q150,100 300,180 T600,120 T900,160 T1200,140" stroke="url(#lineGrad3)" fill="none" strokeWidth="2" opacity="0.5" style={{ animation: 'float1 9s ease-in-out infinite' }} />
          <path d="M0,300 Q200,200 400,350 T800,250 T1200,300" stroke="url(#lineGrad1)" fill="none" strokeWidth="2" opacity="0.45" style={{ animation: 'float2 8s ease-in-out infinite' }} />
          <path d="M0,450 Q250,380 500,480 T900,400 T1300,450" stroke="url(#lineGrad2)" fill="none" strokeWidth="1.5" opacity="0.35" style={{ animation: 'float3 11s ease-in-out infinite' }} />
          <path d="M0,500 Q300,600 600,450 T1000,550 T1400,480" stroke="url(#lineGrad2)" fill="none" strokeWidth="2" opacity="0.4" style={{ animation: 'float1 10s ease-in-out infinite' }} />
          <path d="M0,650 Q200,580 400,680 T800,600 T1200,650" stroke="url(#lineGrad1)" fill="none" strokeWidth="1.5" opacity="0.35" style={{ animation: 'float2 12s ease-in-out infinite' }} />
          <path d="M0,700 Q250,650 500,750 T900,680 T1300,720" stroke="url(#lineGrad1)" fill="none" strokeWidth="1.5" opacity="0.4" style={{ animation: 'float3 12s ease-in-out infinite' }} />
          <circle cx="300" cy="180" r="3.5" fill="#3b82f6" style={{ animation: 'pulse-glow 3s ease-in-out infinite' }} />
          <circle cx="400" cy="350" r="3.5" fill="#06b6d4" style={{ animation: 'pulse-glow 3s ease-in-out infinite 0.5s' }} />
          <circle cx="800" cy="250" r="3" fill="#8b5cf6" style={{ animation: 'pulse-glow 3s ease-in-out infinite 1s' }} />
          <circle cx="600" cy="450" r="3.5" fill="#3b82f6" style={{ animation: 'pulse-glow 3s ease-in-out infinite 1.5s' }} />
          <circle cx="500" cy="680" r="3" fill="#06b6d4" style={{ animation: 'pulse-glow 3s ease-in-out infinite 2s' }} />
          <circle cx="600" cy="450" r="3.5" fill="#8b5cf6" style={{ animation: 'pulse-glow 3s ease-in-out infinite 2s' }} />
        </svg>

        <div className="absolute inset-0 opacity-15">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(rgba(59, 130, 246, 0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59, 130, 246, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }} />
        </div>

        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-15" style={{
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
          animation: 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-15" style={{
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%)',
          animation: 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite 2s',
        }} />

        <div className="relative w-full max-w-[600px] mx-4 rounded-2xl" style={{
          boxShadow: '0 0 15px rgba(59, 130, 246, 0.15), 0 0 30px rgba(139, 92, 246, 0.1)',
        }}>
          <div className="bg-white/80 backdrop-blur-xl rounded-xl px-16 py-12">
            <div className="flex items-center justify-center mb-10">
              <img src={login_icon} alt="Logo" className="h-16 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]" />
            </div>

            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-2 mb-3">
                <IconRobot size={28} className="text-blue-500" style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.4))' }} />
                <h1 className="text-2xl font-semibold bg-gradient-to-r from-blue-500 via-blue-600 to-purple-500 bg-clip-text text-transparent">
                  智能问答助手
                </h1>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <p className="text-xs text-green-600">已登录</p>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                variant="outline"
                fullWidth
                onClick={handleLogout}
                className="border-blue-500/30 text-blue-500 hover:bg-blue-500/5 hover:border-blue-500/50 transition-all duration-300"
                leftSection={<IconShieldLock size={16} />}
              >
                {t('Sign Out')}
              </Button>

              <Button
                variant="subtle"
                fullWidth
                onClick={() => navigate({ to: '/', replace: true })}
                className="text-blue-500 hover:bg-blue-500/5 transition-all duration-300"
              >
                {t('Back to Home')}
              </Button>
            </div>

            <div className="mt-8 pt-6 border-t border-blue-500/15 text-center text-xs text-blue-400/60">
              © 2026 智能问答助手. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex items-center justify-center min-h-screen overflow-hidden" style={{
      background: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 25%, #f5f7ff 50%, #eef2ff 75%, #f0f4ff 100%)',
    }}>
      <style>{animatedLineStyle}</style>

      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="lineGrad1-login" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lineGrad2-login" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lineGrad3-login" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,150 Q150,100 300,180 T600,120 T900,160 T1200,140" stroke="url(#lineGrad3-login)" fill="none" strokeWidth="2" opacity="0.5" style={{ animation: 'float1 9s ease-in-out infinite' }} />
          <path d="M0,300 Q200,200 400,350 T800,250 T1200,300" stroke="url(#lineGrad1-login)" fill="none" strokeWidth="2" opacity="0.45" style={{ animation: 'float2 8s ease-in-out infinite' }} />
          <path d="M0,450 Q250,380 500,480 T900,400 T1300,450" stroke="url(#lineGrad2-login)" fill="none" strokeWidth="1.5" opacity="0.35" style={{ animation: 'float3 11s ease-in-out infinite' }} />
          <path d="M0,500 Q300,600 600,450 T1000,550 T1400,480" stroke="url(#lineGrad2-login)" fill="none" strokeWidth="2" opacity="0.4" style={{ animation: 'float1 10s ease-in-out infinite' }} />
          <path d="M0,650 Q200,580 400,680 T800,600 T1200,650" stroke="url(#lineGrad1-login)" fill="none" strokeWidth="1.5" opacity="0.35" style={{ animation: 'float2 12s ease-in-out infinite' }} />
          <path d="M0,700 Q250,650 500,750 T900,680 T1300,720" stroke="url(#lineGrad1-login)" fill="none" strokeWidth="1.5" opacity="0.4" style={{ animation: 'float3 12s ease-in-out infinite' }} />
          <circle cx="300" cy="180" r="3.5" fill="#3b82f6" style={{ animation: 'pulse-glow 3s ease-in-out infinite' }} />
          <circle cx="400" cy="350" r="3.5" fill="#06b6d4" style={{ animation: 'pulse-glow 3s ease-in-out infinite 0.5s' }} />
          <circle cx="800" cy="250" r="3" fill="#8b5cf6" style={{ animation: 'pulse-glow 3s ease-in-out infinite 1s' }} />
          <circle cx="600" cy="450" r="3.5" fill="#3b82f6" style={{ animation: 'pulse-glow 3s ease-in-out infinite 1.5s' }} />
          <circle cx="500" cy="680" r="3" fill="#06b6d4" style={{ animation: 'pulse-glow 3s ease-in-out infinite 2s' }} />
          <circle cx="600" cy="450" r="3.5" fill="#8b5cf6" style={{ animation: 'pulse-glow 3s ease-in-out infinite 2s' }} />
        </svg>

      <div className="absolute inset-0 opacity-15">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }} />
      </div>

      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-15" style={{
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
        animation: 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }} />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-15" style={{
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%)',
        animation: 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite 2s',
      }} />

      <div className="relative w-full max-w-[600px] mx-4 rounded-2xl" style={{
        boxShadow: '0 0 15px rgba(59, 130, 246, 0.15), 0 0 30px rgba(139, 92, 246, 0.1)',
      }}>
        <div className="bg-white/80 backdrop-blur-xl rounded-xl px-16 py-12">
          <div className="flex items-center justify-center mb-10">
            <img src={login_icon} alt="Logo" className="h-16 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]" />
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <IconRobot size={28} className="text-blue-500" style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.4))' }} />
              <h1 className="text-2xl font-semibold bg-gradient-to-r from-blue-500 via-blue-600 to-purple-500 bg-clip-text text-transparent">
                登录 智能问答助手
              </h1>
            </div>
            <p className="text-xs text-blue-500/70">👋 欢迎！请登录以开始使用。</p>
          </div>

          {error && (
            <Alert icon={<IconAlertCircle size={14} />} color="red" radius="sm" mb="md">
              {error}
            </Alert>
          )}

          <form onSubmit={handleLogin}>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-blue-500/80 mb-1.5">
                  邮箱
                </label>
                <TextInput
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  required
                  classNames={{
                    input: 'bg-blue-50/50 border-blue-500/30 focus:border-blue-500 text-sm h-9 text-gray-700 placeholder:text-gray-400',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-blue-500/80 mb-1.5">
                  密码
                </label>
                <PasswordInput
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  required
                  classNames={{
                    input: 'bg-blue-50/50 border-blue-500/30 focus:border-blue-500 text-sm h-9 text-gray-700 placeholder:text-gray-400',
                  }}
                />
              </div>

              <Button
                type="submit"
                fullWidth
                loading={loading}
                disabled={!email || !password}
                className="text-sm h-9 font-medium transition-all duration-300 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                }}
              >
                {loading ? '登录中...' : '登录'}
              </Button>
            </div>
          </form>

          <div className="mt-6 space-y-2">
            <p className="text-xs text-blue-400/60">
              使用即代表您已同意我们的{' '}
              <a href="#" className="text-blue-500 hover:text-blue-600 hover:underline transition-colors">
                使用协议
              </a>
              {' '}和{' '}
              <a href="#" className="text-blue-500 hover:text-blue-600 hover:underline transition-colors">
                隐私政策
              </a>
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-blue-500/15 text-center text-xs text-blue-400/60">
            © 2026 智能问答助手. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  )
}
