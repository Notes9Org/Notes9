import { streamText, convertToCoreMessages, smoothStream } from 'ai';
import { google } from '@ai-sdk/google';
import { DEFAULT_MODEL_ID, getModelById } from '@/lib/ai/models';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, modelId } = await req.json();

  // Get selected model or default
  const selectedModelId = modelId || DEFAULT_MODEL_ID;
  const modelConfig = getModelById(selectedModelId);
  
  // For now, only Google models are supported
  // Add more providers when API keys are configured
  const model = google(modelConfig?.id || DEFAULT_MODEL_ID);

  const result = streamText({
    model,
    system: `You are Catalyst, an AI research assistant for Notes9 - a scientific lab documentation platform.
You help scientists with their experiments, protocols, and research documentation.

Your capabilities:
- Answer questions about experiments and protocols
- Help with chemistry and biochemistry calculations
- Assist with scientific writing and documentation
- Explain complex scientific concepts

Guidelines:
- Use proper scientific terminology
- Format chemical formulas correctly (H₂O, CO₂, CH₃COOH, etc.)
- Be precise and accurate with scientific information
- When unsure, acknowledge limitations
- Keep responses clear and helpful`,
    messages: convertToCoreMessages(messages),
    // Smooth streaming for better UX - chunks by word instead of token
    experimental_transform: smoothStream({ chunking: 'word' }),
  });

  return result.toUIMessageStreamResponse();
}
