import { z } from 'zod';
import { getCardExplainContext } from './db';
import { DEFAULT_MODEL, extractText, getGeminiClient, Type } from './geminiClient';
import type { PairAssistRequestDTO, PairAssistResponseDTO } from '../types/ipc';

const responseSchema = z.object({
  type: z.enum(['hint', 'next', 'why']),
  content: z.string().min(1).max(260),
  suggestedEdit: z.string().max(260).optional().nullable(),
});

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: ['hint', 'next', 'why'] },
    content: { type: Type.STRING },
    suggestedEdit: { type: Type.STRING },
  },
  required: ['type', 'content'],
};

function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .trim();
}

export async function pairAssist(
  cardId: number,
  request: PairAssistRequestDTO,
): Promise<PairAssistResponseDTO> {
  const client = getGeminiClient();
  const context = getCardExplainContext(cardId);
  const extra = context.extra ?? {};

  const promptPayload = {
    mode: context.kind,
    focus: request.focus,
    target: context.targetLexeme,
    lang: context.lang,
    prompt: stripHtml(context.frontHtml).slice(0, 400),
    solution: stripHtml(context.backHtml).slice(0, 400),
    codeSnippet: request.codeContext ?? String(extra.code ?? ''),
    attempt: request.attempt ?? '',
    explainContext: extra.explainContext ?? '',
    expectedOutput: String(extra.expectedOutput ?? ''),
    language: String(extra.language ?? context.lang ?? 'code'),
  };

  const systemPrompt = `You are a pair-programming assistant who gives short, structured nudges. Respond with concise coaching tailored to the requested focus.
- focus "hint": offer a conceptual nudge without revealing the full answer.
- focus "next": describe the next concrete step the learner should take.
- focus "why": explain the underlying concept or reasoning succinctly.
Keep responses under three sentences.

Return JSON with: type ("hint", "next", or "why"), content (string max 260 chars), optional suggestedEdit (string max 260 chars).`;

  const response = await client.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `${systemPrompt}\n\n${JSON.stringify(promptPayload)}`,
    config: {
      maxOutputTokens: 4000,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const raw = extractText(response).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error('[pairAssist] JSON parse error', { raw, error });
    throw new Error('Assistant response was not valid JSON.');
  }

  const validated = responseSchema.safeParse(parsed);
  if (!validated.success) {
    console.error('[pairAssist] schema validation failed', validated.error);
    throw new Error('Assistant response could not be parsed.');
  }

  return {
    type: validated.data.type,
    content: validated.data.content,
    suggestedEdit: validated.data.suggestedEdit ?? undefined,
  };
}
