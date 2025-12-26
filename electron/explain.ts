import { z } from 'zod';
import { getCardExplainContext } from './db';
import { DEFAULT_MODEL, extractText, getGeminiClient, Type } from './geminiClient';
import type { ExplainResponseDTO, StudyMode } from '../types/ipc';

const explainSchema = z.object({
  title: z.string().min(1).max(80),
  bullets: z.array(z.string().min(1).max(160)).min(2).max(5),
  snippet: z.string().max(200).optional(),
});

const STRICT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    bullets: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    snippet: { type: Type.STRING },
  },
  required: ['title', 'bullets', 'snippet'],
};

const BASIC_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    bullets: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['title', 'bullets'],
};

function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .trim();
}

export interface ExplainPayload {
  attempt?: string;
  codeSnippet?: string;
  language?: string;
  mode?: StudyMode;
}

export async function explainCard(
  cardId: number,
  payload: ExplainPayload = {},
): Promise<ExplainResponseDTO> {
  const context = getCardExplainContext(cardId);
  const client = getGeminiClient();

  const mode: StudyMode = payload.mode ?? (context.kind === 'coding' ? 'coding' : 'vocab');

  const extra = context.extra ?? {};

  const promptPayload = {
    mode,
    target: context.targetLexeme,
    front: stripHtml(context.frontHtml).slice(0, 480),
    back: stripHtml(context.backHtml).slice(0, 480),
    lang: context.lang,
    pos: context.pos,
    senseHint: context.senseHint,
    attempt: payload.attempt ?? '',
    codeSnippet: payload.codeSnippet ?? String(extra.code ?? ''),
    language: payload.language ?? String(extra.language ?? context.lang),
    explainContext: extra.explainContext ?? '',
  };

  const systemPrompt =
    mode === 'coding'
      ? `You are a calm pair-programming coach. Using the provided context, explain the underlying concept succinctly so the learner can reason about the expected program output. Focus on the core idea, not step-by-step execution. Use compact phrases. Return JSON with: title (string, max 80 chars), bullets (array of 2-5 strings, each max 160 chars), snippet (string, max 200 chars).`
      : `You are a concise language coach. Using the provided context, explain the key sense and collocation patterns the learner should remember. Focus on meaning distinctions and usage constraints. Return JSON with: title (string, max 80 chars), bullets (array of 2-5 strings, each max 160 chars), snippet (string, max 200 chars).`;

  const callModel = async (schema: typeof STRICT_RESPONSE_SCHEMA | typeof BASIC_RESPONSE_SCHEMA) => {
    const response = await client.models.generateContent({
      model: DEFAULT_MODEL,
      contents: `${systemPrompt}\n\n${JSON.stringify(promptPayload)}`,
      config: {
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });

    const raw = extractText(response).trim();
    if (!raw) {
      console.error('[explain] empty response payload');
      throw new Error('Explain response was empty.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error('[explain] JSON parse error', { raw, error });
      throw new Error('Explain response was not valid JSON.');
    }

    const validated = explainSchema.safeParse(parsed);
    if (!validated.success) {
      console.error('[explain] schema validation failed', {
        issues: validated.error,
      });
      throw new Error('Explain response could not be parsed.');
    }

    return validated.data;
  };

  let result: z.infer<typeof explainSchema>;
  try {
    result = await callModel(STRICT_RESPONSE_SCHEMA);
  } catch (error) {
    console.warn('[explain] strict schema failed, retrying without snippet', error);
    result = await callModel(BASIC_RESPONSE_SCHEMA);
  }

  const snippet = result.snippet?.trim();

  return {
    title: result.title,
    bullets: result.bullets,
    snippet: snippet ? snippet : undefined,
  };
}
