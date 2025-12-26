export type StudyMode = 'vocab' | 'coding';

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
  vocabCount: number;
  codingCount: number;
  modes: StudyMode[];
  stats: Record<
    StudyMode,
    {
      totalCount: number;
      dueCount: number;
      reviewCount: number;
      completedCount: number;
      newCount: number;
    }
  >;
}

export type RatingValue = 0 | 1 | 2 | 3;

export interface JudgeScoresDTO {
  form: number;
  mechanics: number;
  grammar: number;
}

export interface QualityScoresDTO {
  style: number;         // Generic (0) vs creative (1)
  sophistication: number; // Learner-like (0) vs native-like (1)
  naturalness: number;   // Awkward (0) vs natural (1) collocations
}

export interface JudgeResponseDTO {
  verdict: 'right' | 'unsure' | 'wrong';
  feedback: string;
  scores: JudgeScoresDTO;
  example?: string;
  qualityScores?: QualityScoresDTO;
  quickTip?: string;
}

export interface CollocationInsightDTO {
  original: string;
  assessment: 'natural' | 'acceptable' | 'awkward';
  suggestion?: string;
  note?: string;
}

export interface AlternativeDTO {
  phrase: string;
  register?: 'formal' | 'neutral' | 'informal';
  nuance?: string;
}

export interface InsightsResponseDTO {
  cardId: number;
  sentence: string;
  collocations: CollocationInsightDTO[];
  alternatives: AlternativeDTO[];
  registerNote?: string;
  etymologyHint?: string;
  usagePatterns?: string[];
}

export type FilePath = string;

export interface CodingCard {
  id: number;
  deckId: number;
  prompt: string;
  code: string;
  language: string;
  expectedOutput: string;
  explainContext?: string | null;
  dueTs: number;
  ivlDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

export interface ExplainResponseDTO {
  title: string;
  bullets: string[];
  snippet?: string | null;
}

export type PairAssistRequestFocus = 'hint' | 'next' | 'why';

export interface PairAssistRequestDTO {
  cardId: number;
  focus: PairAssistRequestFocus;
  attempt?: string;
  codeContext?: string;
}

export interface PairAssistResponseDTO {
  type: 'hint' | 'next' | 'why';
  content: string;
  suggestedEdit?: string | null;
}
