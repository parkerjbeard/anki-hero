import { config } from 'dotenv';
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import { URL } from 'node:url';

// Load environment variables from .env file
config();
import {
  initializeDatabase,
  getDeckSummaries,
  getNextReviewCard,
  getNextCodingCard,
  getReviewState,
  updateReviewState,
  getCardMediaRefs,
  getDeckIdForCard,
  incrementNewShownToday,
  deleteDeck,
} from './db';
import { importApkg } from './importApkg';
import { judgeSentence } from './judge';
import { schedule } from './scheduler';
import type { Rating } from './scheduler';
import { explainCard } from './explain';
import { pairAssist } from './pair';
import { getInsights } from './insights';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
let updatePollInterval: NodeJS.Timeout | undefined;

function setupAutoUpdates() {
  if (!app.isPackaged) {
    return;
  }

  const feedUrl = process.env.ANKIHERO_UPDATES_URL?.trim();
  if (!feedUrl) {
    console.warn('[auto-updater] ANKIHERO_UPDATES_URL not set; skipping auto-update setup.');
    return;
  }

  const channel = process.env.ANKIHERO_UPDATES_CHANNEL?.trim();
  if (channel) {
    autoUpdater.channel = channel;
    autoUpdater.allowPrerelease = channel !== 'latest';
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
  } catch (error) {
    console.error('[auto-updater] Failed to configure update feed', error);
    return;
  }

  autoUpdater.on('error', (error) => {
    console.error('[auto-updater] Update error', error);
  });

  autoUpdater.on('update-available', () => {
    console.info('[auto-updater] Update available; downloading...');
  });

  autoUpdater.on('update-downloaded', async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!window) {
      autoUpdater.quitAndInstall();
      return;
    }

    const { response } = await dialog.showMessageBox(window, {
      type: 'info',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update Ready',
      message: 'Anki Hero has downloaded an update. Restart to finish installing?',
    });

    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  const checkForUpdates = () =>
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('[auto-updater] Failed to check for updates', error);
    });

  checkForUpdates();

  if (updatePollInterval) {
    clearInterval(updatePollInterval);
  }

  updatePollInterval = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
}

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
    const filePath = path.join(__dirname, '../../dist/renderer/index.html');
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

  setupAutoUpdates();

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

ipcMain.handle('api:nextCodingCard', (_event, deckId: number) => {
  return getNextCodingCard(deckId);
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

ipcMain.handle('api:explainCard', async (_event, cardId: number, payload) => {
  return explainCard(cardId, payload ?? {});
});

ipcMain.handle('api:pairAssist', async (_event, cardId: number, payload) => {
  return pairAssist(cardId, { cardId, ...(payload ?? {}) });
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
      learning_stage: state.learning_stage,
      difficulty: state.difficulty,
      suspended: state.suspended,
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
    learningStage: next.learning_stage,
    difficulty: next.difficulty,
    suspended: next.suspended,
  });

  // If this was the first successful review (reps moved from 0 → 1), count it toward today's new cap
  if (state.reps === 0 && next.reps > 0) {
    try {
      const deckId = getDeckIdForCard(cardId);
      incrementNewShownToday(deckId);
    } catch (_) {
      // non-fatal
    }
  }
});

ipcMain.handle('api:deleteDeck', async (_event, deckId: number) => {
  await deleteDeck(deckId);
});

ipcMain.handle('api:getInsights', async (_event, cardId: number, sentence: string) => {
  return getInsights(cardId, sentence);
});
