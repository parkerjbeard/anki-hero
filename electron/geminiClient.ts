import { GoogleGenAI, Type, type GenerateContentResponse } from '@google/genai';

export const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview';

const client = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    throw new Error(
      'Language model client not configured. Set GEMINI_API_KEY environment variable.',
    );
  }
  return client;
}

export function extractText(response: GenerateContentResponse): string {
  return response.text ?? '';
}

export { Type };
