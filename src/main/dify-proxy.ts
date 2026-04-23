import { ipcMain, net } from 'electron'
import { DIFY_API_HOST } from '../renderer/variables'

const DIFY_BASE_URL = `http://${DIFY_API_HOST}`

interface DifyRequestPayload {
  path: string
  method: string
  headers: Record<string, string>
  body?: unknown
}

ipcMain.handle('dify-api-request', async (_event, payload: DifyRequestPayload) => {
  const { path, method, headers, body } = payload
  const url = `${DIFY_BASE_URL}${path}`

  try {
    const request = net.request({
      url,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      useSessionCookies: true,
    })

    if (body && method !== 'GET' && method !== 'HEAD') {
      request.write(JSON.stringify(body))
    }

    const response = await new Promise<unknown>((resolve, reject) => {
      request.on('response', (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          const setCookieHeaders = res.headers['set-cookie']
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            setCookie: setCookieHeaders,
            body: data,
          })
        })
      })
      request.on('error', reject)
    })

    return response
  } catch (err: any) {
    throw new Error(`Dify API request failed: ${err.message}`)
  }
})
