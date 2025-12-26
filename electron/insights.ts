import { z } from 'zod';
import { getCardDetail } from './db';
import { DEFAULT_MODEL, extractText, getGeminiClient, Type } from './geminiClient';
import type { InsightsResponseDTO } from '../types/ipc';

const insightsSchema = z.object({
  collocations: z
    .array(
      z.object({
        original: z.string(),
        assessment: z.enum(['natural', 'acceptable', 'awkward']),
        suggestion: z.string().optional(),
        note: z.string().max(100).optional(),
      }),
    )
    .max(3),
  alternatives: z
    .array(
      z.object({
        phrase: z.string().max(100),
        register: z.enum(['formal', 'neutral', 'informal']).optional(),
        nuance: z.string().max(80).optional(),
      }),
    )
    .max(3),
  registerNote: z.string().max(120).optional(),
  etymologyHint: z.string().max(150).optional(),
  usagePatterns: z.array(z.string().max(80)).max(3).optional(),
});

const INSIGHTS_PROMPT = `You are a vocabulary coach providing deep insights for language learners seeking to expand vocabulary and improve writing quality.

Given a sentence using a target word, provide:
1. collocations: Assess 1-3 notable word pairings in the sentence. Are they natural, acceptable, or awkward? Suggest better alternatives for awkward ones with brief notes.
2. alternatives: Suggest 1-3 alternative ways to express the same idea, noting register (formal/neutral/informal) and what makes each different.
3. registerNote: Brief comment on the sentence's formality level if relevant (is it too casual for academic writing? too formal for conversation?).
4. etymologyHint: If helpful for memory, a brief note on word origin, root meaning, or a mnemonic.
5. usagePatterns: 1-3 common patterns, collocations, or phrases with this word that the learner should know.

Be concise but insightful. Focus on what helps the learner write better and sound more native-like.

Return JSON with: collocations (array of objects with original, assessment, optional suggestion, optional note), alternatives (array of objects with phrase, optional register, optional nuance), optional registerNote (string), optional etymologyHint (string), optional usagePatterns (array of strings).`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    collocations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          original: { type: Type.STRING },
          assessment: { type: Type.STRING, enum: ['natural', 'acceptable', 'awkward'] },
          suggestion: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ['original', 'assessment'],
      },
    },
    alternatives: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          phrase: { type: Type.STRING },
          register: { type: Type.STRING, enum: ['formal', 'neutral', 'informal'] },
          nuance: { type: Type.STRING },
        },
        required: ['phrase'],
      },
    },
    registerNote: { type: Type.STRING },
    etymologyHint: { type: Type.STRING },
    usagePatterns: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['collocations', 'alternatives'],
};

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getInsights(cardId: number, sentence: string): Promise<InsightsResponseDTO> {
  const client = getGeminiClient();
  const card = getCardDetail(cardId);

  const payload = {
    TARGET: card.targetLexeme,
    LANG: card.lang,
    POS: card.pos ?? '',
    SENSE_HINT: card.senseHint ?? '',
    BACK_GIST: htmlToText(card.backHtml).slice(0, 240),
    SENTENCE: sentence,
  };

  const response = await client.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `${INSIGHTS_PROMPT}\n\n${JSON.stringify(payload)}`,
    config: {
      maxOutputTokens: 4000,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const text = extractText(response).trim();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch (error) {
    console.error('JSON parse error:', error);
    console.error('Raw text that failed to parse:', text);
    throw new Error('Insights response was not valid JSON.');
  }

  const parsed = insightsSchema.safeParse(parsedJson);

  if (!parsed.success) {
    console.error('Schema validation failed:', parsed.error);
    throw new Error('Insights response could not be parsed.');
  }

  return {
    cardId,
    sentence,
    ...parsed.data,
  };
}
