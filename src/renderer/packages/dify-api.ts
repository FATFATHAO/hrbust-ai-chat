import { DIFY_API_HOST } from '@/variables'

const API_BASE_URL = `http://${DIFY_API_HOST}`

export interface DifyLoginRequest {
  email: string
  password: string
  language: string
  remember_me: boolean
}

export interface DifyLoginResponse {
  result: string
}

export async function difyLogin(params: DifyLoginRequest): Promise<boolean> {
  const loginUrl = `${API_BASE_URL}/console/api/login`

  const requestBody = {
    email: params.email,
    password: btoa(params.password),
    language: params.language || 'zh-Hans',
    remember_me: params.remember_me !== false,
  }

  console.log('🔐 发起登录请求:', loginUrl)
  console.log('📦 请求体:', JSON.stringify(requestBody, null, 2))

  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(requestBody),
  })

  console.log('📨 响应状态:', response.status)

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ 登录失败:', response.status, errorText)
    throw new Error(`Login failed: ${response.status} ${errorText}`)
  }

  const data: DifyLoginResponse = await response.json()
  console.log('✅ 响应体:', data)

  if (data.result !== 'success') {
    throw new Error('Login failed: unexpected response')
  }

  return true
}

export async function difyCheckLogin(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/console/api/profile`, {
      method: 'GET',
      credentials: 'include',
    })
    return response.ok
  } catch {
    return false
  }
}

export interface DifyChatMessageRequest {
  inputs: Record<string, unknown>
  query: string
  response_mode: 'streaming' | 'blocking'
  conversation_id?: string
  user: string
  files?: Array<{
    type: string
    transfer_method: 'remote_url' | 'local_file'
    url?: string
    upload_file_id?: string
  }>
}

export async function difyChatMessage(params: DifyChatMessageRequest): Promise<Response> {
  const url = `${API_BASE_URL}/v1/chat-messages`

  console.log('💬 发起知识库提问:', url)

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      inputs: params.inputs || {},
      query: params.query,
      response_mode: params.response_mode || 'streaming',
      conversation_id: params.conversation_id || '',
      user: params.user,
      files: params.files || [],
    }),
  })
}

export async function difyApiRequest<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API request failed: ${response.status} ${errorText}`)
  }

  return response.json()
}
