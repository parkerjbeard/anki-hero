import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
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

export function DecksScreen() {
  const { data, isLoading, refetch } = useDecks();
  const queryClient = useQueryClient();
  const { selectDeck, setActiveScreen, selectedDeckId } = useAppStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decks = useMemo(() => data ?? [], [data]);

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
        <h1>Anki Hero</h1>
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
            <div>
              <h2>{deck.name}</h2>
              <p>
                Due <strong>{deck.dueCount}</strong> · Total <strong>{deck.totalCount}</strong> ·
                Next {formatNextDue(deck.nextDue)}
              </p>
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
