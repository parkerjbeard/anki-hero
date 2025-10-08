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
  example: z.string().min(1).max(120),
});

const SYSTEM_PROMPT = `You are a vocabulary sentence judge. Using the provided context, assess whether SENTENCE uses TARGET in the intended sense and give concise usage coaching.
Stay focused on language mechanics—do not moralize, tone police, or comment on sentiment.
If SENTENCE is incorrect or awkward, ensure the feedback pinpoints the issue and the example supplies a corrected sentence that demonstrates proper usage of TARGET.
When SENTENCE is correct, keep feedback brief and leave the example empty unless a short celebratory variant is essential.`;

const RESPONSE_FORMAT = {
  type: 'json_schema',
  name: 'judge_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['verdict', 'feedback', 'scores'],
    properties: {
      verdict: {
        type: 'string',
        enum: ['right', 'unsure', 'wrong'],
      },
      feedback: {
        type: 'string',
        minLength: 1,
        maxLength: 180,
      },
      scores: {
        type: 'object',
        additionalProperties: false,
        required: ['meaning', 'syntax', 'collocation'],
        properties: {
          meaning: { type: 'number', minimum: 0, maximum: 1 },
          syntax: { type: 'number', minimum: 0, maximum: 1 },
          collocation: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
      example: {
        type: 'string',
        minLength: 1,
        maxLength: 120,
      },
    },
    required: ['verdict', 'feedback', 'scores', 'example'],
  },
} as const;

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5';
const STRICTNESS = process.env.ANKI_HERO_STRICTNESS ?? 'normal';

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    })
  : null;

function normalize(sentence: string): string {
  return sentence
    .replace(/["'.!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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
    throw new Error(
      'Language model client not configured. Set OPENAI_API_KEY environment variable.',
    );
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
    reasoning: {
      effort: 'low',
    },
    max_output_tokens: 600,
    text: {
      format: RESPONSE_FORMAT,
      verbosity: 'low',
    },
    input: `${SYSTEM_PROMPT}\n\n${JSON.stringify(payload)}`,
  });

  const text = extractText(response);
  const safeText = text.trim();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(safeText);
  } catch (error) {
    console.error('JSON parse error:', error);
    console.error('Raw text that failed to parse:', safeText);
    throw new Error('Judge response was not valid JSON.');
  }

  const parsed = schema.safeParse(parsedJson);

  if (!parsed.success) {
    console.error('Schema validation failed:', parsed.error);
    throw new Error('Judge response could not be parsed.');
  }

  return parsed.data;
}

function extractText(result: Awaited<ReturnType<OpenAI['responses']['create']>>): string {
  // Handle GPT-5 Responses API format - check for choices array first
  if ('choices' in result && Array.isArray(result.choices) && result.choices.length > 0) {
    const choice = result.choices[0];

    // Check for direct text format (most common for GPT-5)
    if ('text' in choice && typeof choice.text === 'string') {
      return choice.text;
    }

    // Check for message.content format
    if ('message' in choice && choice.message && 'content' in choice.message) {
      return choice.message.content;
    }
  }

  // Handle GPT-5 Responses API format - check for output_text
  if ('output_text' in result && typeof result.output_text === 'string') {
    return result.output_text;
  }

  // Fallback to legacy format handling
  const maybeOutputText = (result as unknown as { output_text?: string[] }).output_text;
  if (Array.isArray(maybeOutputText) && maybeOutputText.length > 0) {
    return maybeOutputText.join('').trim();
  }

  const segments = ((result as any).output ?? []).flatMap((item: any) => item.content ?? []);
  const extracted = segments
    .map((segment: any) => {
      if ('text' in segment && segment.text) {
        return segment.text;
      }
      return '';
    })
    .join('')
    .trim();

  return extracted;
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
