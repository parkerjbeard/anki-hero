import { contextBridge, ipcRenderer } from 'electron';
import type {
  ImportDeckResult,
  DeckSummaryDTO,
  FrontBackCard,
  RatingValue,
  JudgeResponseDTO,
} from '../types/ipc';

const api = {
  importApkg: (filePath: string): Promise<ImportDeckResult> =>
    ipcRenderer.invoke('api:importApkg', filePath),
  chooseApkg: (): Promise<string | null> => ipcRenderer.invoke('api:chooseApkg'),
  listDecks: (): Promise<DeckSummaryDTO[]> => ipcRenderer.invoke('api:listDecks'),
  nextCard: (deckId: number): Promise<FrontBackCard | null> => ipcRenderer.invoke('api:nextCard', deckId),
  playAudio: (cardId: number): Promise<string[]> => ipcRenderer.invoke('api:playAudio', cardId),
  judgeSentence: (cardId: number, sentence: string): Promise<JudgeResponseDTO> =>
    ipcRenderer.invoke('api:judgeSentence', cardId, sentence),
  rate: (cardId: number, rating: RatingValue): Promise<void> =>
    ipcRenderer.invoke('api:rate', cardId, rating),
};

contextBridge.exposeInMainWorld('api', api);

declare global {
  interface Window {
    api: typeof api;
  }
}
