import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import OpenAI from './models/openai' // 套用OpenAI的请求处理逻辑

const MY_PROVIDER_ID = 'hrbust' as ModelProviderEnum

export const hrbustProvider = defineProvider({
  id: MY_PROVIDER_ID,
  name: '智能问答平台',
  type: ModelProviderType.OpenAI, // 使用OpenAI的底层通信协议
  description: '政务大模型专属问答平台',
  urls: {
    website: 'http://10.1.100.109:8080', // 换成你们自己的域名
  },
  defaultSettings: {
    apiHost: 'http://127.0.0.1:8001/v1',
    models: [
      {
        modelId: 'qwen2.5:32b',
        capabilities: ['vision', 'tool_use'],
        contextWindow: 128_000,
        maxOutput: 8_192,
      },
    ],
  },
  createModel: (config) => {
    // 用OpenAI的引擎去驱动模型
    return new OpenAI(
      {
        apiKey: config.providerSetting.apiKey || 'sk-hrbust-dummy-key', // 后端没配鉴权，随便塞个假key防报错
        apiHost: config.formattedApiHost,
        model: config.model,
        dalleStyle: config.settings.dalleStyle || 'vivid',
        temperature: config.settings.temperature,
        topP: config.settings.topP,
        maxOutputTokens: config.settings.maxTokens,
        injectDefaultMetadata: config.globalSettings.injectDefaultMetadata,
        useProxy: false,
        stream: config.settings.stream,
      },
      config.dependencies,
    )
  },
  getDisplayName: (modelId) => {
    // UI展示名称
    return `智能问答平台 (${modelId})`
  },
})
