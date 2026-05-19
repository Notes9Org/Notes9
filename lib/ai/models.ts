// Catalyst model registry.
// The actual model is selected and run server-side by the Notes9 backend
// (see CHAT_API_URL). This client-side list controls only the dropdown labels
// and the `catalyst-model` cookie sent on each request; the backend is the
// source of truth for which provider/key is used.

export const DEFAULT_MODEL_ID = 'default';

export interface ChatModel {
  id: string;
  name: string;
  provider: 'notes9';
  description: string;
  isReasoning?: boolean;
}

export const chatModels: ChatModel[] = [
  {
    id: 'default',
    name: 'Notes9 Assistant',
    provider: 'notes9',
    description: 'Default research assistant for the Notes9 workspace',
  },
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
  notes9: 'Notes9',
};

export function getModelById(id: string): ChatModel | undefined {
  return chatModels.find((m) => m.id === id);
}

export function getDefaultModel(): ChatModel {
  return chatModels.find((m) => m.id === DEFAULT_MODEL_ID) || chatModels[0];
}
