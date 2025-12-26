import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { DeckSummaryDTO, StudyMode } from '../../types/ipc';
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
type ModeFilter = 'all' | 'vocab' | 'coding';
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
  const { selectDeck, setActiveScreen, setActiveMode, selectedDeckId, activeMode } = useAppStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [deletingDeckId, setDeletingDeckId] = useState<number | null>(null);
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

  const filteredDecks = useMemo(() => {
    if (modeFilter === 'all') {
      return decks;
    }
    const predicate =
      modeFilter === 'coding'
        ? (deck: DeckSummaryDTO) => deck.codingCount > 0
        : (deck: DeckSummaryDTO) => deck.vocabCount > 0;
    return decks.filter(predicate);
  }, [decks, modeFilter]);

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

  const handleStudyModeChange = useCallback(
    (mode: StudyMode) => {
      setActiveMode(mode);
    },
    [setActiveMode],
  );

  const handleStart = useCallback(
    (deck: DeckSummaryDTO, mode: StudyMode) => {
      selectDeck(deck.id);
      setActiveMode(mode);
      setActiveScreen('review');
    },
    [selectDeck, setActiveMode, setActiveScreen],
  );

  const handleDelete = useCallback(
    async (event: MouseEvent<HTMLButtonElement>, deck: DeckSummaryDTO) => {
      event.stopPropagation();
      if (deletingDeckId) {
        return;
      }
      const confirmed = window.confirm(
        `Delete “${deck.name}”? All cards and progress for this deck will be removed.`,
      );
      if (!confirmed) {
        return;
      }

      setError(null);
      setDeletingDeckId(deck.id);
      try {
        await window.api.deleteDeck(deck.id);
        if (selectedDeckId === deck.id) {
          selectDeck(null);
        }
        await queryClient.invalidateQueries({ queryKey: ['decks'] });
        await refetch();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setDeletingDeckId(null);
      }
    },
    [deletingDeckId, queryClient, refetch, selectDeck, selectedDeckId],
  );

  const handleDeckModeBadgeClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>, deckId: number, mode: StudyMode) => {
      event.stopPropagation();
      if (selectedDeckId !== deckId) {
        selectDeck(deckId);
      }
      if (activeMode !== mode) {
        setActiveMode(mode);
      }
    },
    [activeMode, selectDeck, selectedDeckId, setActiveMode],
  );

  const activeModeLabel = activeMode === 'coding' ? 'Coding' : 'Vocab';
  const sortOrderLabel = sortOrder === 'random' ? 'Random' : 'Alphabetical';
  const modeFilterLabel =
    modeFilter === 'all' ? 'All' : modeFilter === 'coding' ? 'Coding' : 'Vocab';

  return (
    <div className="screen decks-screen">
      <header className="decks-header">
        <div className="header-top">
          <div className="title-group">
            <h1>Anki Hero</h1>
            <p className="tagline">Turn passive vocabulary into active power.</p>
          </div>
          <div className="decks-toolbar">
            <div className="toolbar-group toolbar-collapsible">
              <div className="toolbar-label-row">
                <span className="toolbar-label">Study Mode</span>
                <span className="toolbar-value">{activeModeLabel}</span>
              </div>
              <div className="segmented-control" role="group" aria-label="Select study mode">
                <button
                  type="button"
                  className={activeMode === 'vocab' ? 'active' : ''}
                  onClick={() => handleStudyModeChange('vocab')}
                  disabled={busy}
                >
                  Vocab
                </button>
                <button
                  type="button"
                  className={activeMode === 'coding' ? 'active' : ''}
                  onClick={() => handleStudyModeChange('coding')}
                  disabled={busy}
                >
                  Coding
                </button>
              </div>
            </div>
            <div className="toolbar-group toolbar-collapsible">
              <div className="toolbar-label-row">
                <span className="toolbar-label">Deck Order</span>
                <span className="toolbar-value">{sortOrderLabel}</span>
              </div>
              <div className="segmented-control" role="group" aria-label="Sort decks">
                <button
                  type="button"
                  className={sortOrder === 'alphabetical' ? 'active' : ''}
                  onClick={() => setSortOrder('alphabetical')}
                  disabled={busy}
                >
                  Alphabetical
                </button>
                <button
                  type="button"
                  className={sortOrder === 'random' ? 'active' : ''}
                  onClick={() => setSortOrder('random')}
                  disabled={busy}
                >
                  Random
                </button>
              </div>
            </div>
            <div className="toolbar-group toolbar-collapsible">
              <div className="toolbar-label-row">
                <span className="toolbar-label">Show Decks</span>
                <span className="toolbar-value">{modeFilterLabel}</span>
              </div>
              <div className="segmented-control" role="group" aria-label="Filter decks by mode">
                <button
                  type="button"
                  className={modeFilter === 'all' ? 'active' : ''}
                  onClick={() => setModeFilter('all')}
                  disabled={busy}
                >
                  All
                </button>
                <button
                  type="button"
                  className={modeFilter === 'vocab' ? 'active' : ''}
                  onClick={() => setModeFilter('vocab')}
                  disabled={busy}
                >
                  Vocab
                </button>
                <button
                  type="button"
                  className={modeFilter === 'coding' ? 'active' : ''}
                  onClick={() => setModeFilter('coding')}
                  disabled={busy}
                >
                  Coding
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={handleImportClick} disabled={busy}>
            {busy ? 'Importing…' : 'Import Anki Deck'}
          </button>
        </div>
      </header>

      <main className="deck-list">
        {error ? <p className="error">{error}</p> : null}
        {isLoading ? <p>Loading decks…</p> : null}
        {!isLoading && filteredDecks.length === 0 ? (
          <p className="empty">Import an Anki deck (`.apkg`) to get started.</p>
        ) : null}

        {filteredDecks.map((deck) => {
          const modes = deck.modes;
          const isSelected = selectedDeckId === deck.id;
          const isDeleting = deletingDeckId === deck.id;
          const emptyModeStats = {
            totalCount: 0,
            dueCount: 0,
            reviewCount: 0,
            completedCount: 0,
            newCount: 0,
          };
          const selectedModeStats = deck.stats[activeMode] ?? emptyModeStats;
          const selectedModeLabel = activeMode === 'coding' ? 'Coding' : 'Vocab';
          const selectedModeCount = selectedModeStats.totalCount;
          const alternateMode: StudyMode = activeMode === 'coding' ? 'vocab' : 'coding';
          const alternateModeStats = deck.stats[alternateMode] ?? emptyModeStats;
          const alternateModeLabel = alternateMode === 'coding' ? 'Coding' : 'Vocab';
          const alternateModeCount = alternateModeStats.totalCount;
          return (
            <article
              key={deck.id}
              className={`deck-card ${isSelected ? 'selected' : ''}`}
              onClick={() => selectDeck(deck.id)}
            >
              <button
                type="button"
                className="deck-card-delete"
                aria-label={`Delete ${deck.name}`}
                title="Delete deck"
                onClick={(event) => handleDelete(event, deck)}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
              <div className="deck-card-info">
                <div className="deck-card-heading">
                  <h2>{deck.name}</h2>
                  <span className="deck-card-next">Next {formatNextDue(deck.nextDue)}</span>
                </div>
                <div className="deck-card-badges">
                  {modes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`deck-mode-badge ${mode === 'coding' ? 'coding' : 'vocab'} ${
                        mode === activeMode ? 'active' : ''
                      }`}
                      aria-pressed={mode === activeMode}
                      onClick={(event) => handleDeckModeBadgeClick(event, deck.id, mode)}
                    >
                      {mode === 'coding' ? 'Coding' : 'Vocab'}
                    </button>
                  ))}
                </div>
                <div className="deck-card-stats">
                  <span className="deck-stat">
                    <span className="deck-stat-label">In Review</span>
                    <span className="deck-stat-value">{selectedModeStats.reviewCount}</span>
                  </span>
                  <span className="deck-stat">
                    <span className="deck-stat-label">Completed</span>
                    <span className="deck-stat-value">{selectedModeStats.completedCount}</span>
                  </span>
                  <span className="deck-stat">
                    <span className="deck-stat-label">New</span>
                    <span className="deck-stat-value">{selectedModeStats.newCount}</span>
                  </span>
                </div>
                <div className="deck-card-totals">
                  <span className="deck-card-total">
                    {selectedModeLabel} cards {selectedModeStats.totalCount}
                  </span>
                  {alternateModeCount > 0 ? (
                    <span className="deck-card-total secondary">
                      {alternateModeLabel} {alternateModeCount}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="deck-card-actions">
                <button
                  type="button"
                  className={`primary-action ${activeMode === 'coding' ? 'coding' : 'vocab'}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleStart(deck, activeMode);
                  }}
                  disabled={busy || isDeleting || selectedModeCount === 0}
                >
                  {selectedModeCount === 0
                    ? `No ${selectedModeLabel} cards`
                    : `Study ${selectedModeLabel}`}
                </button>
                {alternateModeCount > 0 ? (
                  <button
                    type="button"
                    className="subtle"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleStudyModeChange(alternateMode);
                    }}
                    disabled={busy || isDeleting}
                  >
                    {alternateModeLabel} available
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}
