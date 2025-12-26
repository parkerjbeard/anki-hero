import { contextBridge, ipcRenderer } from 'electron';
import type {
  ImportDeckResult,
  DeckSummaryDTO,
  FrontBackCard,
  RatingValue,
  JudgeResponseDTO,
  CodingCard,
  ExplainResponseDTO,
  PairAssistRequestDTO,
  PairAssistResponseDTO,
  InsightsResponseDTO,
} from '../types/ipc';

const api = {
  importApkg: (filePath: string): Promise<ImportDeckResult> =>
    ipcRenderer.invoke('api:importApkg', filePath),
  chooseApkg: (): Promise<string | null> => ipcRenderer.invoke('api:chooseApkg'),
  listDecks: (): Promise<DeckSummaryDTO[]> => ipcRenderer.invoke('api:listDecks'),
  nextCard: (deckId: number): Promise<FrontBackCard | null> =>
    ipcRenderer.invoke('api:nextCard', deckId),
  nextCodingCard: (deckId: number): Promise<CodingCard | null> =>
    ipcRenderer.invoke('api:nextCodingCard', deckId),
  playAudio: (cardId: number): Promise<string[]> => ipcRenderer.invoke('api:playAudio', cardId),
  judgeSentence: (cardId: number, sentence: string): Promise<JudgeResponseDTO> =>
    ipcRenderer.invoke('api:judgeSentence', cardId, sentence),
  explainCard: (cardId: number, payload?: ExplainPayload): Promise<ExplainResponseDTO> =>
    ipcRenderer.invoke('api:explainCard', cardId, payload ?? {}),
  pairAssist: (
    cardId: number,
    payload: Omit<PairAssistRequestDTO, 'cardId'>,
  ): Promise<PairAssistResponseDTO> => ipcRenderer.invoke('api:pairAssist', cardId, payload),
  rate: (cardId: number, rating: RatingValue): Promise<void> =>
    ipcRenderer.invoke('api:rate', cardId, rating),
  deleteDeck: (deckId: number): Promise<void> => ipcRenderer.invoke('api:deleteDeck', deckId),
  getInsights: (cardId: number, sentence: string): Promise<InsightsResponseDTO> =>
    ipcRenderer.invoke('api:getInsights', cardId, sentence),
};

interface ExplainPayload {
  attempt?: string;
  codeSnippet?: string;
  language?: string;
  mode?: 'vocab' | 'coding';
}

contextBridge.exposeInMainWorld('api', api);

declare global {
  interface Window {
    api: typeof api;
  }
}
