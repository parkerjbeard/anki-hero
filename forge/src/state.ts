import { create } from 'zustand';

type Screen = 'decks' | 'review';

interface AppState {
  activeScreen: Screen;
  selectedDeckId: number | null;
  setActiveScreen: (screen: Screen) => void;
  selectDeck: (deckId: number | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeScreen: 'decks',
  selectedDeckId: null,
  setActiveScreen: (activeScreen) => set({ activeScreen }),
  selectDeck: (selectedDeckId) => set({ selectedDeckId }),
}));
