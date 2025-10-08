export interface ImportDeckResult {
  deckId: number;
  count: number;
}

export interface FrontBackCard {
  id: number;
  targetLexeme: string;
  frontHtml: string;
  backHtml: string;
  audioRefs: string[];
  lang: string;
  pos?: string | null;
  senseHint?: string | null;
  dueTs: number;
  ivlDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

export interface DeckSummaryDTO {
  id: number;
  name: string;
  dueCount: number;
  totalCount: number;
  nextDue: number | null;
  newCount: number;
  reviewCount: number;
  completedCount: number;
}

export type RatingValue = 0 | 1 | 2 | 3;

export interface JudgeScoresDTO {
  meaning: number;
  syntax: number;
  collocation: number;
}

export interface JudgeResponseDTO {
  verdict: 'right' | 'unsure' | 'wrong';
  feedback: string;
  scores: JudgeScoresDTO;
  example?: string;
}

export type FilePath = string;
