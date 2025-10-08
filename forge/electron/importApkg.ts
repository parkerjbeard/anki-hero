import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import {
  attachReviewRow,
  insertCard,
  insertDeck,
  insertNote,
  runInTransaction,
} from './db';

interface AnkiModel {
  name: string;
  flds: Array<{ name: string }>;
  tmpls: Array<{ name: string; qfmt: string; afmt: string }>;
}

interface NoteRecord {
  id: number;
  mid: number;
  flds: string;
  tags: string;
}

interface CardRecord {
  id: number;
  nid: number;
  ord: number;
}

export interface ImportResult {
  deckId: number;
  count: number;
}

function extractFields(raw: string): string[] {
  return raw.split('\u001f').map((segment) => segment.trim());
}

const SOUND_PATTERN = /\[sound:([^\]]+)]/gi;

function stripSoundTokens(input: string): string {
  return input.replace(SOUND_PATTERN, '').trim();
}

function extractAudioRefs(...sources: string[]): string[] {
  const results = new Set<string>();
  for (const source of sources) {
    let match: RegExpExecArray | null;
    SOUND_PATTERN.lastIndex = 0;
    while ((match = SOUND_PATTERN.exec(source)) !== null) {
      results.add(match[1]);
    }
  }
  return [...results];
}

function renderTemplate(template: string, fieldMap: Record<string, string>): string {
  const withoutFrontSide = template.replace(/{{\s*FrontSide\s*}}/gi, '');
  return withoutFrontSide.replace(/{{([^}]+)}}/g, (_, key: string) => {
    const cleanedKey = key.replace(/[#^\/]/g, '').replace(/type:/i, '').trim();
    return fieldMap[cleanedKey] ?? '';
  });
}

function guessTargetLexeme(fieldMap: Record<string, string>): string {
  const priorityKeys = ['Word', 'Vocab', 'Expression', 'Kanji', 'Target', 'Term'];

  for (const key of priorityKeys) {
    const match = fieldMap[key];
    if (match) {
      return match.replace(SOUND_PATTERN, '').trim();
    }
  }

  const [first] = Object.values(fieldMap);
  return stripSoundTokens(first ?? '');
}

function guessLang(tags: string[]): string {
  if (tags.some((tag) => /spanish|español|es\b/i.test(tag))) {
    return 'es';
  }
  if (tags.some((tag) => /(japanese|日本語)/i.test(tag))) {
    return 'ja';
  }
  if (tags.some((tag) => /(french|français)/i.test(tag))) {
    return 'fr';
  }
  return 'en';
}

function guessSenseHint(fieldMap: Record<string, string>): string | null {
  const hintKey = Object.keys(fieldMap).find((key) => /hint|meaning|definition/i.test(key));
  if (!hintKey) {
    return null;
  }
  return stripSoundTokens(fieldMap[hintKey]);
}

function guessPos(fieldMap: Record<string, string>): string | null {
  const posKey = Object.keys(fieldMap).find((key) => /(pos|part of speech)/i.test(key));
  if (!posKey) {
    return null;
  }
  return stripSoundTokens(fieldMap[posKey]).toLowerCase();
}

function buildFieldMap(model: AnkiModel | undefined, fields: string[]): Record<string, string> {
  if (!model) {
    const [first = '', second = ''] = fields;
    return {
      Front: first,
      Back: second,
    };
  }

  return model.flds.reduce<Record<string, string>>((acc, field, index) => {
    acc[field.name] = fields[index] ?? '';
    return acc;
  }, {});
}

function deriveCardFaces(
  template: { qfmt: string; afmt: string } | undefined,
  fieldMap: Record<string, string>,
  fallbackFields: string[],
): { front: string; back: string } {
  if (!template) {
    const [front = '', back = ''] = fallbackFields;
    return {
      front: stripSoundTokens(front),
      back: stripSoundTokens(back) || stripSoundTokens(fallbackFields.slice(1).join('<br />')),
    };
  }

  const front = renderTemplate(template.qfmt, fieldMap);
  const back = renderTemplate(template.afmt, fieldMap);

  return {
    front: stripSoundTokens(front),
    back: stripSoundTokens(back),
  };
}

async function copyMediaAssets(
  deckId: number,
  referencedFiles: Set<string>,
  tempDir: string,
  mediaManifest: Record<string, string>,
) {
  if (referencedFiles.size === 0) {
    return;
  }

  const mediaDir = path.join(app.getPath('userData'), 'media', String(deckId));
  await fs.ensureDir(mediaDir);

  const reverseLookup = new Map<string, string>();
  for (const [id, filename] of Object.entries(mediaManifest)) {
    reverseLookup.set(filename, id);
  }

  await Promise.all(
    [...referencedFiles].map(async (filename) => {
      const sourceId = reverseLookup.get(filename);
      if (!sourceId) {
        return;
      }
      const sourcePath = path.join(tempDir, sourceId);
      const targetPath = path.join(mediaDir, filename);
      try {
        await fs.copyFile(sourcePath, targetPath);
      } catch (error) {
        console.warn('[import] failed to copy media asset', { filename, error });
      }
    }),
  );
}

export async function importApkg(filePath: string): Promise<ImportResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anki-hero-'));

  try {
    const zip = new AdmZip(filePath);
    zip.extractAllTo(tempDir, true);

    const collectionPath = path.join(tempDir, 'collection.anki2');
    if (!(await fs.pathExists(collectionPath))) {
      throw new Error('collection.anki2 not found in archive');
    }

    const mediaManifestPath = path.join(tempDir, 'media');
    const mediaManifest = (await fs.pathExists(mediaManifestPath))
      ? (JSON.parse(await fs.readFile(mediaManifestPath, 'utf8')) as Record<string, string>)
      : {};

    const modelMap = new Map<number, AnkiModel>();
    let notes: NoteRecord[] = [];
    let cards: CardRecord[] = [];

    const collection = new Database(collectionPath, { readonly: true, fileMustExist: true });
    try {
      const modelsRow = collection.prepare(`SELECT models FROM col LIMIT 1`).get() as { models: string };
      const parsedModels = JSON.parse(modelsRow.models) as Record<string, AnkiModel & { id: number }>;
      for (const [id, model] of Object.entries(parsedModels)) {
        modelMap.set(Number(model.id ?? id), model);
      }

      notes = collection.prepare<unknown[], NoteRecord>(`SELECT id, mid, flds, tags FROM notes`).all();
      cards = collection.prepare<unknown[], CardRecord>(`SELECT id, nid, ord FROM cards`).all();
    } finally {
      collection.close();
    }

    const noteMap = new Map<number, NoteRecord>();
    for (const note of notes) {
      noteMap.set(note.id, note);
    }

    const referencedAudio = new Set<string>();
    const deckName = path.basename(filePath, path.extname(filePath));

    const { deckId, count } = runInTransaction((database) => {
      const deckId = insertDeck(database, { name: deckName, sourcePath: filePath });

      for (const note of notes) {
        const fields = extractFields(note.flds);
        const tags = note.tags.split(' ').map((tag) => tag.trim()).filter(Boolean);
        insertNote(database, { id: note.id, deckId, fields, tags });
      }

      let cardCount = 0;

      for (const card of cards) {
        const note = noteMap.get(card.nid);
        if (!note) continue;

        const model = modelMap.get(note.mid);
        const fields = extractFields(note.flds);
        const fieldMap = buildFieldMap(model, fields);
        const template = model?.tmpls?.[card.ord];
        const { front, back } = deriveCardFaces(template, fieldMap, fields);
        const audioRefs = extractAudioRefs(front, back, ...fields);
        audioRefs.forEach((ref) => referencedAudio.add(ref));

        insertCard(database, {
          id: card.id,
          noteId: note.id,
          frontHtml: front,
          backHtml: back,
          audioRefs,
          targetLexeme: guessTargetLexeme(fieldMap),
          lang: guessLang(note.tags.split(' ').map((tag) => tag.trim()).filter(Boolean)),
          pos: guessPos(fieldMap),
          senseHint: guessSenseHint(fieldMap),
        });

        attachReviewRow(card.id, database);
        cardCount += 1;
      }

      return { deckId, count: cardCount };
    });

    await copyMediaAssets(deckId, referencedAudio, tempDir, mediaManifest);

    return { deckId, count };
  } finally {
    await fs.remove(tempDir);
  }
}
