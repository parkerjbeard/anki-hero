export {};

declare global {
  interface Window {
    api: {
      importApkg: (filePath: string) => Promise<import('../../types/ipc').ImportDeckResult>;
      listDecks: () => Promise<import('../../types/ipc').DeckSummaryDTO[]>;
      nextCard: (deckId: number) => Promise<import('../../types/ipc').FrontBackCard | null>;
      playAudio: (cardId: number) => Promise<string[]>;
      judgeSentence: (
        cardId: number,
        sentence: string,
      ) => Promise<import('../../types/ipc').JudgeResponseDTO>;
      rate: (cardId: number, rating: import('../../types/ipc').RatingValue) => Promise<void>;
      chooseApkg: () => Promise<string | null>;
    };
  }
}
