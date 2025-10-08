export interface DeckRow {
  id: number;
  name: string;
  source_path: string | null;
  imported_at: number;
}

export interface NoteRow {
  id: number;
  deck_id: number;
  fields_json: string;
  tags_json: string;
}

export interface CardRow {
  id: number;
  note_id: number;
  front_html: string;
  back_html: string;
  audio_refs_json: string;
  target_lexeme: string;
  lang: string;
  pos: string | null;
  sense_hint: string | null;
}

export interface ReviewRow {
  id: number;
  card_id: number;
  due_ts: number;
  ivl_days: number;
  ease: number;
  reps: number;
  lapses: number;
}

export interface AttemptRow {
  id: number;
  card_id: number;
  when_ts: number;
  step: string;
  sentence: string;
  verdict: string;
  feedback: string;
  example: string | null;
}

export interface CardForReview {
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

export interface CardDetail {
  id: number;
  targetLexeme: string;
  lang: string;
  pos: string | null;
  senseHint: string | null;
  backHtml: string;
  previousSentences: string[];
  previousExamples: string[];
}
