import { create } from 'zustand';

type Screen = 'decks' | 'review';

interface AppState {
  activeScreen: Screen;
  activeMode: 'vocab' | 'coding';
  selectedDeckId: number | null;
  setActiveScreen: (screen: Screen) => void;
  setActiveMode: (mode: 'vocab' | 'coding') => void;
  selectDeck: (deckId: number | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeScreen: 'decks',
  activeMode: 'vocab',
  selectedDeckId: null,
  setActiveScreen: (activeScreen) => set({ activeScreen }),
  setActiveMode: (activeMode) => set({ activeMode }),
  selectDeck: (selectedDeckId) => set({ selectedDeckId }),
}));
