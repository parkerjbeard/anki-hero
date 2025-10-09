import Database from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'node:path';
import { app } from 'electron';
import type { CardDetail, CardForReview } from './types';

const DB_FILENAME = 'anki-hero.sqlite';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }

  return db;
}

export function initializeDatabase(): Database.Database {
  const userDataDir = app.getPath('userData');
  const dataDir = path.join(userDataDir, 'storage');
  fs.ensureDirSync(dataDir);

  const dbPath = path.join(dataDir, DB_FILENAME);
  const instance = new Database(dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  applySchema(instance);

  db = instance;
  return instance;
}

function applySchema(database: Database.Database) {
  const userVersion = Number(database.pragma('user_version', { simple: true }));

  if (userVersion < 1) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS decks (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        source_path TEXT,
        imported_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY,
        deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        fields_json TEXT NOT NULL,
        tags_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY,
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        front_html TEXT NOT NULL,
        back_html TEXT NOT NULL,
        audio_refs_json TEXT NOT NULL DEFAULT '[]',
        target_lexeme TEXT NOT NULL,
        lang TEXT NOT NULL,
        pos TEXT,
        sense_hint TEXT
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY,
        card_id INTEGER UNIQUE NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        due_ts INTEGER NOT NULL,
        ivl_days INTEGER NOT NULL,
        ease REAL NOT NULL,
        reps INTEGER NOT NULL,
        lapses INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attempts (
        id INTEGER PRIMARY KEY,
        card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        when_ts INTEGER NOT NULL,
        step TEXT NOT NULL,
        sentence TEXT NOT NULL,
        verdict TEXT NOT NULL,
        feedback TEXT NOT NULL,
        example TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notes_deck_id ON notes(deck_id);
      CREATE INDEX IF NOT EXISTS idx_cards_note_id ON cards(note_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_due_ts ON reviews(due_ts);
      CREATE INDEX IF NOT EXISTS idx_attempts_card_id ON attempts(card_id);
    `);
    database.pragma('user_version = 1');
  }

  if (userVersion < 2) {
    database.exec(`
      ALTER TABLE reviews ADD COLUMN difficulty REAL NOT NULL DEFAULT 0.5;
      ALTER TABLE reviews ADD COLUMN learning_stage INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE reviews ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE decks ADD COLUMN daily_new_cap INTEGER NOT NULL DEFAULT 20;

      CREATE TABLE IF NOT EXISTS daily_stats (
        deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        date_ymd TEXT NOT NULL,
        new_shown INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (deck_id, date_ymd)
      );

      CREATE INDEX IF NOT EXISTS idx_reviews_learning_due ON reviews(learning_stage, due_ts);
    `);
    database.pragma('user_version = 2');
  }
}

export interface DeckSummary {
  id: number;
  name: string;
  dueCount: number;
  totalCount: number;
  nextDue: number | null;
  newCount: number;
  reviewCount: number;
  completedCount: number;
}

export function getDeckSummaries(): DeckSummary[] {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT
      d.id,
      d.name,
      COUNT(c.id) AS totalCount,
      COALESCE(SUM(CASE WHEN r.due_ts <= @now THEN 1 ELSE 0 END), 0) AS dueCount,
      MIN(r.due_ts) AS nextDue,
      COALESCE(SUM(CASE WHEN r.reps = 0 OR r.reps IS NULL THEN 1 ELSE 0 END), 0) AS newCount,
      COALESCE(SUM(CASE WHEN r.reps > 0 AND r.due_ts <= @now THEN 1 ELSE 0 END), 0) AS reviewCount,
      COALESCE(SUM(CASE WHEN r.reps > 0 AND r.due_ts > @now THEN 1 ELSE 0 END), 0) AS completedCount
    FROM decks d
    LEFT JOIN notes n ON n.deck_id = d.id
    LEFT JOIN cards c ON c.note_id = n.id
    LEFT JOIN reviews r ON r.card_id = c.id
    GROUP BY d.id
    ORDER BY d.name ASC
  `);

  return stmt.all({ now: Date.now() }) as DeckSummary[];
}

export function getNextReviewCard(deckId: number): CardForReview | null {
  const database = getDatabase();
  const now = Date.now();
  const cap = getDeckDailyNewCap(deckId);
  const newShown = getNewShownToday(deckId);
  const canShowNew = newShown < cap;

  // 1) Learning/review due now
  const dueStmt = database.prepare(`
    SELECT
      c.id AS id,
      c.front_html AS frontHtml,
      c.back_html AS backHtml,
      c.audio_refs_json AS audioRefs,
      c.target_lexeme AS targetLexeme,
      c.lang AS lang,
      c.pos AS pos,
      c.sense_hint AS senseHint,
      r.due_ts AS dueTs,
      r.ivl_days AS ivlDays,
      r.ease AS ease,
      r.reps AS reps,
      r.lapses AS lapses
    FROM cards c
    JOIN notes n ON n.id = c.note_id
    JOIN reviews r ON r.card_id = c.id
    WHERE n.deck_id = @deckId
      AND r.suspended = 0
      AND r.due_ts <= @now
      AND (r.learning_stage > 0 OR r.reps > 0)
    ORDER BY r.due_ts ASC, c.id ASC
    LIMIT 1
  `);

  let row = dueStmt.get({ deckId, now }) as
    | (Omit<CardForReview, 'audioRefs'> & { audioRefs: string })
    | undefined;

  if (!row && canShowNew) {
    // 2) New card (reps = 0), subject to daily cap
    const newStmt = database.prepare(`
      SELECT
        c.id AS id,
        c.front_html AS frontHtml,
        c.back_html AS backHtml,
        c.audio_refs_json AS audioRefs,
        c.target_lexeme AS targetLexeme,
        c.lang AS lang,
        c.pos AS pos,
        c.sense_hint AS senseHint,
        r.due_ts AS dueTs,
        r.ivl_days AS ivlDays,
        r.ease AS ease,
        r.reps AS reps,
        r.lapses AS lapses
      FROM cards c
      JOIN notes n ON n.id = c.note_id
      JOIN reviews r ON r.card_id = c.id
      WHERE n.deck_id = @deckId
        AND r.suspended = 0
        AND r.reps = 0
      ORDER BY RANDOM()
      LIMIT 1
    `);
    row = newStmt.get({ deckId }) as
      | (Omit<CardForReview, 'audioRefs'> & { audioRefs: string })
      | undefined;
  }

  if (!row) return null;

  return {
    ...row,
    audioRefs: JSON.parse(row.audioRefs) as string[],
  };
}

export function getLastAttempt(cardId: number) {
  const database = getDatabase();
  return database
    .prepare(
      `
      SELECT sentence, verdict, feedback, example, when_ts AS whenTs
      FROM attempts
      WHERE card_id = ?
      ORDER BY when_ts DESC
      LIMIT 1
    `,
    )
    .get(cardId) as
    | {
        sentence: string;
        verdict: string;
        feedback: string;
        example: string | null;
        whenTs: number;
      }
    | undefined;
}

export function insertAttempt(params: {
  cardId: number;
  whenTs: number;
  step: string;
  sentence: string;
  verdict: string;
  feedback: string;
  example?: string | null;
}) {
  const database = getDatabase();
  database
    .prepare(
      `
      INSERT INTO attempts (card_id, when_ts, step, sentence, verdict, feedback, example)
      VALUES (@cardId, @whenTs, @step, @sentence, @verdict, @feedback, @example)
    `,
    )
    .run({
      cardId: params.cardId,
      whenTs: params.whenTs,
      step: params.step,
      sentence: params.sentence,
      verdict: params.verdict,
      feedback: params.feedback,
      example: params.example ?? null,
    });
}

export interface ReviewUpdate {
  cardId: number;
  dueTs: number;
  ivlDays: number;
  ease: number;
  reps: number;
  lapses: number;
  learningStage?: number;
  difficulty?: number;
  suspended?: number;
}

export function updateReviewState(update: ReviewUpdate) {
  const database = getDatabase();
  database
    .prepare(
      `
      UPDATE reviews
      SET due_ts = @dueTs,
          ivl_days = @ivlDays,
          ease = @ease,
          reps = @reps,
          lapses = @lapses,
          learning_stage = COALESCE(@learningStage, learning_stage),
          difficulty = COALESCE(@difficulty, difficulty),
          suspended = COALESCE(@suspended, suspended)
      WHERE card_id = @cardId
    `,
    )
    .run(update);
}

export interface ReviewState {
  due_ts: number;
  ivl_days: number;
  ease: number;
  reps: number;
  lapses: number;
  learning_stage: number;
  difficulty: number;
  suspended: number;
}

export function getReviewState(cardId: number): ReviewState {
  const database = getDatabase();
  const row = database
    .prepare(
      `
      SELECT due_ts, ivl_days, ease, reps, lapses, learning_stage, difficulty, suspended
      FROM reviews
      WHERE card_id = ?
    `,
    )
    .get(cardId) as ReviewState | undefined;

  if (!row) {
    throw new Error(`Missing review state for card ${cardId}`);
  }

  return row;
}

export function attachReviewRow(cardId: number, database: Database.Database) {
  const insert = database.prepare(
    `
      INSERT OR IGNORE INTO reviews (card_id, due_ts, ivl_days, ease, reps, lapses, difficulty, learning_stage, suspended)
      VALUES (@cardId, @dueTs, @ivlDays, @ease, @reps, @lapses, @difficulty, @learningStage, @suspended)
    `,
  );

  insert.run({
    cardId,
    dueTs: Date.now(),
    ivlDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    difficulty: 0.5,
    learningStage: 0,
    suspended: 0,
  });
}

export interface NewDeckArgs {
  name: string;
  sourcePath?: string | null;
}

export function insertDeck(database: Database.Database, args: NewDeckArgs): number {
  const result = database
    .prepare(
      `
      INSERT INTO decks (name, source_path, imported_at)
      VALUES (@name, @sourcePath, @importedAt)
    `,
    )
    .run({
      name: args.name,
      sourcePath: args.sourcePath ?? null,
      importedAt: Date.now(),
    });

  return Number(result.lastInsertRowid);
}

export interface NewNoteArgs {
  id: number;
  deckId: number;
  fields: unknown[];
  tags: string[];
}

export function insertNote(database: Database.Database, note: NewNoteArgs) {
  database
    .prepare(
      `
      INSERT OR REPLACE INTO notes (id, deck_id, fields_json, tags_json)
      VALUES (@id, @deckId, @fieldsJson, @tagsJson)
    `,
    )
    .run({
      id: note.id,
      deckId: note.deckId,
      fieldsJson: JSON.stringify(note.fields),
      tagsJson: JSON.stringify(note.tags),
    });
}

export interface NewCardArgs {
  id: number;
  noteId: number;
  frontHtml: string;
  backHtml: string;
  audioRefs: string[];
  targetLexeme: string;
  lang: string;
  pos?: string | null;
  senseHint?: string | null;
}

export function insertCard(database: Database.Database, card: NewCardArgs) {
  database
    .prepare(
      `
      INSERT OR REPLACE INTO cards (id, note_id, front_html, back_html, audio_refs_json, target_lexeme, lang, pos, sense_hint)
      VALUES (@id, @noteId, @frontHtml, @backHtml, @audioRefsJson, @targetLexeme, @lang, @pos, @senseHint)
    `,
    )
    .run({
      id: card.id,
      noteId: card.noteId,
      frontHtml: card.frontHtml,
      backHtml: card.backHtml,
      audioRefsJson: JSON.stringify(card.audioRefs),
      targetLexeme: card.targetLexeme,
      lang: card.lang,
      pos: card.pos ?? null,
      senseHint: card.senseHint ?? null,
    });
}

export function runInTransaction<T>(fn: (database: Database.Database) => T): T {
  const database = getDatabase();
  const trx = database.transaction(() => fn(database));
  return trx();
}

// Daily new-card cap helpers
function todayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDeckDailyNewCap(deckId: number): number {
  const database = getDatabase();
  const row = database
    .prepare('SELECT daily_new_cap AS cap FROM decks WHERE id = ?')
    .get(deckId) as { cap?: number } | undefined;
  return row?.cap ?? 20;
}

export function getNewShownToday(deckId: number): number {
  const database = getDatabase();
  const row = database
    .prepare('SELECT new_shown AS n FROM daily_stats WHERE deck_id = ? AND date_ymd = ? LIMIT 1')
    .get(deckId, todayYMD()) as { n?: number } | undefined;
  return row?.n ?? 0;
}

export function incrementNewShownToday(deckId: number) {
  const database = getDatabase();
  database
    .prepare(
      `INSERT INTO daily_stats (deck_id, date_ymd, new_shown)
       VALUES (@deckId, @date, 1)
       ON CONFLICT(deck_id, date_ymd) DO UPDATE SET new_shown = new_shown + 1`,
    )
    .run({ deckId, date: todayYMD() });
}

export function getDeckIdForCard(cardId: number): number {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT n.deck_id AS deckId
       FROM cards c JOIN notes n ON n.id = c.note_id
       WHERE c.id = ?`,
    )
    .get(cardId) as { deckId?: number } | undefined;
  if (!row?.deckId) throw new Error(`Deck not found for card ${cardId}`);
  return row.deckId;
}

export function getCardDetail(cardId: number): CardDetail {
  const database = getDatabase();
  const cardRow = database
    .prepare(
      `
      SELECT
        c.id,
        c.target_lexeme AS targetLexeme,
        c.lang,
        c.pos,
        c.sense_hint AS senseHint,
        c.back_html AS backHtml
      FROM cards c
      WHERE c.id = ?
    `,
    )
    .get(cardId) as
    | {
        id: number;
        targetLexeme: string;
        lang: string;
        pos: string | null;
        senseHint: string | null;
        backHtml: string;
      }
    | undefined;

  if (!cardRow) {
    throw new Error(`Card ${cardId} not found`);
  }

  const attemptRows = database
    .prepare(
      `
      SELECT sentence, example
      FROM attempts
      WHERE card_id = ?
      ORDER BY when_ts ASC
    `,
    )
    .all(cardId) as Array<{ sentence: string; example: string | null }>;

  return {
    id: cardRow.id,
    targetLexeme: cardRow.targetLexeme,
    lang: cardRow.lang,
    pos: cardRow.pos ?? null,
    senseHint: cardRow.senseHint ?? null,
    backHtml: cardRow.backHtml,
    previousSentences: attemptRows.map((row) => row.sentence),
    previousExamples: attemptRows
      .map((row) => row.example)
      .filter((example): example is string => Boolean(example)),
  };
}

export function getCardMediaRefs(cardId: number): { deckId: number; audioRefs: string[] } {
  const database = getDatabase();
  const row = database
    .prepare(
      `
      SELECT
        n.deck_id AS deckId,
        c.audio_refs_json AS audioRefs
      FROM cards c
      JOIN notes n ON n.id = c.note_id
      WHERE c.id = ?
    `,
    )
    .get(cardId) as { deckId: number; audioRefs: string } | undefined;

  if (!row) {
    throw new Error(`No audio references for card ${cardId}`);
  }

  return {
    deckId: row.deckId,
    audioRefs: JSON.parse(row.audioRefs) as string[],
  };
}
