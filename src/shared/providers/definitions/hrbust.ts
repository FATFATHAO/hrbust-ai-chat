import { type ModelProviderEnum, ModelProviderType } from "../../types";
import { defineProvider } from "../registry";
import OpenAI from "./models/openai"; // 套用OpenAI的请求处理逻辑

const MY_PROVIDER_ID = "hrbust" as ModelProviderEnum;

// Coze Personal Access Token (PAT)
const DEFAULT_API_KEY = "pat_1d06944dcd318b1645a078fd93c28e0bea2e7eb9e0d8df37d09c7387d94b5e43";

export const hrbustProvider = defineProvider({
  id: MY_PROVIDER_ID,
  name: "智能问答平台",
  type: ModelProviderType.OpenAI, // 使用OpenAI的底层通信协议
  description: "政务大模型专属问答平台",
  urls: {
    website: "https://ai.yuecin.com:40010",
  },
  defaultSettings: {
    apiKey: DEFAULT_API_KEY,
    apiHost: "http://ai.yuecin.com:40011/api",
    models: [
      {
        // TODO: 后续从 API 动态拉取模型列表
        modelId: "7626374607464824832",
        capabilities: ["vision", "tool_use"],
        contextWindow: 128_000,
        maxOutput: 8_192,
        nickname: "qwen2.5:32b",
      },
    ],
  },
  createModel: (config) => {
    // 用OpenAI的引擎去驱动模型
    return new OpenAI(
      {
        apiKey: config.providerSetting.apiKey || DEFAULT_API_KEY,
        apiHost: config.formattedApiHost,
        model: config.model,
        dalleStyle: config.settings.dalleStyle || "vivid",
        temperature: config.settings.temperature,
        topP: config.settings.topP,
        maxOutputTokens: config.settings.maxTokens,
        injectDefaultMetadata: config.globalSettings.injectDefaultMetadata,
        useProxy: false,
        stream: config.settings.stream,
      },
      config.dependencies,
    );
  },
  getDisplayName: (modelId) => {
    // UI展示名称
    return `智能问答平台 (${modelId})`;
  },
});
