import { app, BrowserWindow, ipcMain, nativeTheme, dialog, protocol } from 'electron';
import path from 'node:path';
import { URL } from 'node:url';
import {
  initializeDatabase,
  getDeckSummaries,
  getNextReviewCard,
  getReviewState,
  updateReviewState,
  getCardMediaRefs,
} from './db';
import { importApkg } from './importApkg';
import { judgeSentence } from './judge';
import { schedule } from './scheduler';
import type { Rating } from './scheduler';

const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;

async function createWindow() {
  const preloadPath = path.join(__dirname, '../../dist-preload/preload/index.js');

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f172a' : '#f9fafb',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    const filePath = path.join(__dirname, '../dist/renderer/index.html');
    await window.loadURL(new URL(`file://${filePath}`).toString());
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.whenReady().then(() => {
  protocol.registerFileProtocol('media', (request, callback) => {
    const url = new URL(request.url);
    const deckId = url.hostname;
    const filePath = decodeURIComponent(url.pathname.slice(1));
    callback(path.join(app.getPath('userData'), 'media', deckId, filePath));
  });

  try {
    initializeDatabase();
  } catch (error) {
    dialog.showErrorBox('Database Error', (error as Error).message);
    app.exit(1);
    return;
  }

  createWindow().catch((err) => {
    console.error('[main] failed to create window', err);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((err) => console.error('[main] failed to re-create window', err));
    }
  });
});

ipcMain.handle('api:listDecks', () => {
  return getDeckSummaries();
});

ipcMain.handle('api:chooseApkg', async () => {
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const { canceled, filePaths } = await dialog.showOpenDialog(parent ?? undefined, {
    title: 'Import Anki Deck',
    buttonLabel: 'Import',
    filters: [{ name: 'Anki Deck', extensions: ['apkg'] }],
    properties: ['openFile', 'dontAddToRecent'],
  });
  if (canceled || filePaths.length === 0) {
    return null;
  }
  return filePaths[0];
});

ipcMain.handle('api:importApkg', async (_event, filePath: string) => importApkg(filePath));

ipcMain.handle('api:nextCard', (_event, deckId: number) => {
  return getNextReviewCard(deckId);
});

ipcMain.handle('api:playAudio', (_event, cardId: number) => {
  const { deckId, audioRefs } = getCardMediaRefs(cardId);
  const baseDir = path.join(app.getPath('userData'), 'media', String(deckId));
  return audioRefs.map((file) => {
    const absolutePath = path.join(baseDir, file);
    const relativePath = path.relative(baseDir, absolutePath);
    return `media://${deckId}/${encodeURIComponent(relativePath).replace(/%2F/g, '/')}`;
  });
});

ipcMain.handle('api:judgeSentence', async (_event, cardId: number, sentence: string) => {
  return judgeSentence(cardId, sentence);
});

ipcMain.handle('api:rate', (_event, cardId: number, rating: Rating) => {
  const state = getReviewState(cardId);
  const next = schedule(
    {
      ivl_days: state.ivl_days,
      ease: state.ease,
      reps: state.reps,
      lapses: state.lapses,
      due_ts: state.due_ts,
    },
    rating,
  );
  updateReviewState({
    cardId,
    dueTs: next.due_ts,
    ivlDays: next.ivl_days,
    ease: next.ease,
    reps: next.reps,
    lapses: next.lapses,
  });
});
