import { z } from 'zod';
import { getCardDetail, getLastAttempt, insertAttempt } from './db';
import type { CardDetail } from './types';
import type { JudgeResponseDTO } from '../types/ipc';
import { DEFAULT_MODEL, extractText, getGeminiClient, Type } from './geminiClient';

const schema = z.object({
  verdict: z.enum(['right', 'unsure', 'wrong']),
  feedback: z.string().min(1).max(180),
  scores: z.object({
    form: z.number().min(0).max(1),
    mechanics: z.number().min(0).max(1),
    grammar: z.number().min(0).max(1),
  }),
  example: z.string().min(1).max(120).optional(),
  qualityScores: z
    .object({
      style: z.number().min(0).max(1),
      sophistication: z.number().min(0).max(1),
      naturalness: z.number().min(0).max(1),
    })
    .optional(),
  quickTip: z.string().max(80).optional(),
});

const SYSTEM_PROMPT = `You are a vocabulary sentence judge and writing coach. Using the provided context, assess whether SENTENCE uses TARGET in the intended sense and provide both correctness coaching and quality feedback.

CORRECTNESS SCORES (0-1):
- form — is TARGET expressed in the correct sense, with the right inflection and collocational partners?
- grammar — does the sentence respect grammatical structure (word order, agreement, tense, connectors)?
- mechanics — do spelling, capitalization, and punctuation support clarity?

QUALITY SCORES (0-1, provide when verdict is "right" or "unsure"):
- style — is the sentence vivid, interesting, or creative (1.0) vs generic/textbook-like (0.5) vs dull (0.0)?
- sophistication — does it sound native-like (1.0), intermediate (0.5), or obviously learner-like (0.0)?
- naturalness — are the word combinations and collocations natural (1.0), acceptable (0.5), or awkward (0.0)?

GUIDELINES:
- Do not moralize, tone police, or comment on sentiment; focus on language craft.
- If SENTENCE has issues, pinpoint the highest-priority problem and provide a short corrected example if needed.
- When SENTENCE is correct but quality scores are low (any below 0.6), provide a quickTip (max 80 chars) suggesting how to make it more interesting, vivid, or native-like.
- When SENTENCE is both correct and high-quality, keep feedback brief and celebratory.

Return JSON with: verdict ("right", "unsure", or "wrong"), feedback (string max 180 chars), scores object with form/mechanics/grammar (numbers 0-1), optional example (string max 120 chars), optional qualityScores object with style/sophistication/naturalness (numbers 0-1), optional quickTip (string max 80 chars).`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verdict: {
      type: Type.STRING,
      enum: ['right', 'unsure', 'wrong'],
    },
    feedback: {
      type: Type.STRING,
    },
    scores: {
      type: Type.OBJECT,
      properties: {
        form: { type: Type.NUMBER },
        mechanics: { type: Type.NUMBER },
        grammar: { type: Type.NUMBER },
      },
      required: ['form', 'mechanics', 'grammar'],
    },
    example: {
      type: Type.STRING,
    },
    qualityScores: {
      type: Type.OBJECT,
      properties: {
        style: { type: Type.NUMBER },
        sophistication: { type: Type.NUMBER },
        naturalness: { type: Type.NUMBER },
      },
      required: ['style', 'sophistication', 'naturalness'],
    },
    quickTip: {
      type: Type.STRING,
    },
  },
  required: ['verdict', 'feedback', 'scores'],
};

const STRICTNESS = process.env.ANKI_HERO_STRICTNESS ?? 'normal';

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
  const client = getGeminiClient();

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

  const response = await client.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `${SYSTEM_PROMPT}\n\n${JSON.stringify(payload)}`,
    config: {
      maxOutputTokens: 4000,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
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
