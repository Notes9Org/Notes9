// AI Models Configuration for Catalyst
// Using Google AI models via @ai-sdk/google

export const DEFAULT_MODEL_ID = 'gemini-2.5-flash-lite';

export interface ChatModel {
  id: string;
  name: string;
  provider: 'google' | 'openai' | 'anthropic';
  description: string;
  isReasoning?: boolean;
}

export const chatModels: ChatModel[] = [
  // Google Models (Primary - using your API key)
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'google',
    description: 'Fast and efficient for most tasks',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    description: 'Quick responses, good for simple queries',
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    provider: 'google',
    description: 'Most capable, best for complex tasks',
  },
  // Can add more providers later when API keys are available
  // {
  //   id: 'gpt-4o-mini',
  //   name: 'GPT-4o Mini',
  //   provider: 'openai',
  //   description: 'Fast and affordable',
  // },
  // {
  //   id: 'claude-3-haiku',
  //   name: 'Claude 3 Haiku',
  //   provider: 'anthropic',
  //   description: 'Fast and affordable',
  // },
];

// Group models by provider for UI
export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);

// Provider display names
export const providerNames: Record<string, string> = {
  google: 'Google',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

// Get model by ID
export function getModelById(id: string): ChatModel | undefined {
  return chatModels.find((m) => m.id === id);
}

// Get default model
export function getDefaultModel(): ChatModel {
  return chatModels.find((m) => m.id === DEFAULT_MODEL_ID) || chatModels[0];
}

