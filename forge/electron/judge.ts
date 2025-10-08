import OpenAI from 'openai';
import { z } from 'zod';
import { getCardDetail, getLastAttempt, insertAttempt } from './db';
import type { CardDetail } from './types';
import type { JudgeResponseDTO } from '../types/ipc';

const schema = z.object({
  verdict: z.enum(['right', 'unsure', 'wrong']),
  feedback: z.string().min(1).max(180),
  scores: z.object({
    meaning: z.number().min(0).max(1),
    syntax: z.number().min(0).max(1),
    collocation: z.number().min(0).max(1),
  }),
  example: z.string().max(120).optional(),
});

const SYSTEM_PROMPT =
  'Judge if SENTENCE uses TARGET in the right sense. Be terse. Output strict JSON only.';

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const STRICTNESS = process.env.ANKI_HERO_STRICTNESS ?? 'normal';

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    })
  : null;

function normalize(sentence: string): string {
  return sentence.replace(/["'.!?]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function callModel(card: CardDetail, sentence: string): Promise<JudgeResponseDTO> {
  if (!client) {
    throw new Error('Language model client not configured. Set OPENAI_API_KEY.');
  }

  const payload = {
    TARGET: card.targetLexeme,
    POS: card.pos ?? '',
    LANG: card.lang,
    SENSE_HINT: card.senseHint ?? '',
    BACK_GIST: htmlToText(card.backHtml).slice(0, 240),
    SENTENCE: sentence,
    STRICTNESS,
    PRIOR_USER: card.previousSentences.slice(-3),
    PRIOR_EXAMPLES: card.previousExamples.slice(-3),
  };

  const response = await client.responses.create({
    model: DEFAULT_MODEL,
    temperature: 0.2,
    max_output_tokens: 300,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text' as const, text: SYSTEM_PROMPT }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text' as const, text: JSON.stringify(payload) }],
      },
    ],
  });

  const text = extractText(response);
  const safeText = text.trim();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(safeText);
  } catch (error) {
    throw new Error('Judge response was not valid JSON.');
  }

  const parsed = schema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error('Judge response could not be parsed.');
  }

  return parsed.data;
}

function extractText(result: Awaited<ReturnType<OpenAI['responses']['create']>>): string {
  const maybeOutputText = (result as unknown as { output_text?: string[] }).output_text;
  if (Array.isArray(maybeOutputText) && maybeOutputText.length > 0) {
    return maybeOutputText.join('').trim();
  }
  const segments = ((result as any).output ?? []).flatMap((item: any) => item.content ?? []);
  return segments
    .map((segment: any) => {
      if ('text' in segment && segment.text) {
        return segment.text;
      }
      return '';
    })
    .join('')
    .trim();
}

export async function judgeSentence(cardId: number, sentence: string): Promise<JudgeResponseDTO> {
  const trimmed = sentence.trim();
  if (!trimmed) {
    throw new Error('Please write a sentence first.');
  }

  const normalized = normalize(trimmed);
  const card = getCardDetail(cardId);
  const lastAttempt = getLastAttempt(cardId);

  if (lastAttempt && normalize(lastAttempt.sentence) === normalized) {
    throw new Error('Write it a new way.');
  }

  if (card.previousExamples.some((example) => normalize(example) === normalized)) {
    throw new Error('Try a different example than the hint.');
  }

  const judged = await callModel(card, trimmed);

  insertAttempt({
    cardId,
    whenTs: Date.now(),
    step: 'write',
    sentence: trimmed,
    verdict: judged.verdict,
    feedback: judged.feedback,
    example: judged.example ?? null,
  });

  return judged;
}
