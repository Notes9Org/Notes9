import { streamText, convertToCoreMessages } from 'ai';
import { google } from '@ai-sdk/google';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google('gemini-2.0-flash'),
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
  });

  return result.toUIMessageStreamResponse();
}
