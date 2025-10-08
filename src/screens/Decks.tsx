import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeckSummaryDTO } from '../../types/ipc';
import { useAppStore } from '../state';

function useDecks() {
  return useQuery({
    queryKey: ['decks'],
    queryFn: () => window.api.listDecks(),
  });
}

function formatNextDue(timestamp: number | null) {
  if (!timestamp) return '—';
  const diff = timestamp - Date.now();
  if (diff <= 0) return 'Ready now';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}

type SortOrder = 'alphabetical' | 'random';
const SORT_ORDER_STORAGE_KEY = 'deck-sort-order';

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function matchesOriginalOrder(items: DeckSummaryDTO[], candidate: DeckSummaryDTO[]) {
  return items.every((item, index) => candidate[index]?.id === item.id);
}

export function DecksScreen() {
  const { data, isLoading, refetch } = useDecks();
  const queryClient = useQueryClient();
  const { selectDeck, setActiveScreen, selectedDeckId } = useAppStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    if (typeof window === 'undefined') {
      return 'alphabetical';
    }
    const stored = window.localStorage.getItem(SORT_ORDER_STORAGE_KEY);
    return stored === 'random' ? 'random' : 'alphabetical';
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SORT_ORDER_STORAGE_KEY, sortOrder);
  }, [sortOrder]);

  const decks = useMemo(() => {
    const items = data ?? [];
    if (items.length === 0) {
      return items;
    }
    if (sortOrder === 'random') {
      if (items.length < 2) {
        return items;
      }
      let shuffled = shuffle(items);
      if (matchesOriginalOrder(items, shuffled)) {
        shuffled = shuffle(items);
      }
      return shuffled;
    }
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }, [data, sortOrder]);

  const handleImportClick = useCallback(async () => {
    setError(null);
    const filePath = await window.api.chooseApkg();
    if (!filePath) {
      return;
    }
    setBusy(true);
    try {
      await window.api.importApkg(filePath);
      await queryClient.invalidateQueries({ queryKey: ['decks'] });
      await refetch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [queryClient, refetch]);

  const handleStart = useCallback(
    (deck: DeckSummaryDTO) => {
      selectDeck(deck.id);
      setActiveScreen('review');
    },
    [selectDeck, setActiveScreen],
  );

  return (
    <div className="screen decks-screen">
      <header className="decks-header">
        <div className="header-top">
          <h1>Anki Hero</h1>
          <div className="decks-settings">
            <label htmlFor="deck-order">Order</label>
            <select
              id="deck-order"
              value={sortOrder}
              onChange={(event) =>
                setSortOrder(event.target.value === 'random' ? 'random' : 'alphabetical')
              }
            >
              <option value="alphabetical">Alphabetical</option>
              <option value="random">Random</option>
            </select>
          </div>
        </div>
        <p className="tagline">Turn passive vocabulary into active power.</p>
        <div className="actions">
          <button type="button" onClick={handleImportClick} disabled={busy}>
            {busy ? 'Importing…' : 'Import Anki Deck'}
          </button>
        </div>
      </header>

      <main className="deck-list">
        {error ? <p className="error">{error}</p> : null}
        {isLoading ? <p>Loading decks…</p> : null}
        {!isLoading && decks.length === 0 ? (
          <p className="empty">Import an Anki deck (`.apkg`) to get started.</p>
        ) : null}

        {decks.map((deck) => (
          <article
            key={deck.id}
            className={`deck-card ${selectedDeckId === deck.id ? 'selected' : ''}`}
            onClick={() => selectDeck(deck.id)}
          >
            <div className="deck-card-info">
              <div className="deck-card-heading">
                <h2>{deck.name}</h2>
                <span className="deck-card-next">Next {formatNextDue(deck.nextDue)}</span>
              </div>
              <div className="deck-card-stats">
                <span className="deck-stat">
                  <span className="deck-stat-label">In Review</span>
                  <span className="deck-stat-value">{deck.reviewCount}</span>
                </span>
                <span className="deck-stat">
                  <span className="deck-stat-label">Completed</span>
                  <span className="deck-stat-value">{deck.completedCount}</span>
                </span>
                <span className="deck-stat">
                  <span className="deck-stat-label">New</span>
                  <span className="deck-stat-value">{deck.newCount}</span>
                </span>
              </div>
              <span className="deck-card-total">Total {deck.totalCount}</span>
            </div>
            <div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleStart(deck);
                }}
                disabled={busy}
              >
                Start Review
              </button>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}
