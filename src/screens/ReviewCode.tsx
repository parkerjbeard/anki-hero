import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CodingCard, RatingValue } from '../../types/ipc';
import { CodeEditor } from '../components/CodeEditor';
import { ExplainButton } from '../components/ExplainButton';
import { AssistantDrawer } from '../components/AssistantDrawer';
import { useAppStore } from '../state';

interface DiffLine {
  line: number;
  expected: string;
  actual: string;
}

interface CompareResult {
  status: 'pass' | 'fail';
  expected: string;
  actual: string;
  diff: DiffLine[];
}

interface AttemptRecord {
  value: string;
  result: CompareResult;
}

const MAX_ATTEMPTS = 3;

function normalizeOutput(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

function diffLines(expected: string, actual: string): DiffLine[] {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const max = Math.max(expectedLines.length, actualLines.length);
  const diffs: DiffLine[] = [];

  for (let i = 0; i < max; i += 1) {
    const expectedLine = expectedLines[i] ?? '';
    const actualLine = actualLines[i] ?? '';
    if (expectedLine !== actualLine) {
      diffs.push({
        line: i + 1,
        expected: expectedLine,
        actual: actualLine,
      });
    }
  }

  return diffs;
}

export function ReviewCodeScreen() {
  const { selectedDeckId, setActiveScreen } = useAppStore();
  const [card, setCard] = useState<CodingCard | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState('');
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [awaitingRating, setAwaitingRating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const lastAttempt = attempts.at(-1) ?? null;

  const loadNextCard = useCallback(async () => {
    if (!selectedDeckId) {
      setCard(null);
      return;
    }
    setLoadingCard(true);
    setError(null);
    setComparing(false);
    setCompareResult(null);
    setPrediction('');
    setAttempts([]);
    setAwaitingRating(false);
    try {
      const next = await window.api.nextCodingCard(selectedDeckId);
      setCard(next);
      if (next) {
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingCard(false);
    }
  }, [selectedDeckId]);

  useEffect(() => {
    loadNextCard().catch((err) => setError((err as Error).message));
  }, [loadNextCard]);

  const handleCompare = useCallback(async () => {
    if (!card || !prediction.trim() || comparing || awaitingRating) {
      return;
    }
    setComparing(true);
    const expectedNormalized = normalizeOutput(card.expectedOutput);
    const actualNormalized = normalizeOutput(prediction);
    const passed = expectedNormalized === actualNormalized;
    const diff = passed ? [] : diffLines(expectedNormalized, actualNormalized);
    const trimmedPrediction = prediction.trim();
    const result: CompareResult = {
      status: passed ? 'pass' : 'fail',
      expected: expectedNormalized,
      actual: actualNormalized,
      diff,
    };

    const nextAttempts = [...attempts, { value: trimmedPrediction, result }];

    setCompareResult(result);
    setAttempts(nextAttempts);
    setPrediction('');

    if (passed) {
      setAwaitingRating(true);
    } else if (nextAttempts.length >= MAX_ATTEMPTS) {
      try {
        await window.api.rate(card.id, 0);
        await queryClient.invalidateQueries({ queryKey: ['decks'] });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setAwaitingRating(false);
        setTimeout(() => {
          loadNextCard().catch(() => {});
        }, 200);
      }
    }

    setComparing(false);
  }, [attempts, awaitingRating, card, comparing, prediction, loadNextCard, queryClient]);

  const handleManualRate = useCallback(
    async (rating: RatingValue) => {
      if (!card) return;
      try {
        await window.api.rate(card.id, rating);
        await queryClient.invalidateQueries({ queryKey: ['decks'] });
        setAwaitingRating(false);
        await loadNextCard();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [card, loadNextCard, queryClient],
  );

  const refExpected = useMemo(() => (card ? normalizeOutput(card.expectedOutput) : ''), [card]);

  if (!selectedDeckId) {
    return (
      <div className="screen review-screen coding-review">
        <p>No deck selected.</p>
        <button type="button" onClick={() => setActiveScreen('decks')}>
          Back to Decks
        </button>
      </div>
    );
  }

  return (
    <div className="screen review-screen coding-review">
      <header className="review-header">
        <button type="button" onClick={() => setActiveScreen('decks')}>
          ← Decks
        </button>
        <div>
          <h1>Coding Review</h1>
          <p className="muted">
            {card ? card.prompt : 'Stay sharp with output prediction drills.'}
          </p>
        </div>
        <div className="card-meta">
          <span className="lang-tag">{card?.language ?? '—'}</span>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {loadingCard ? <p className="muted">Loading coding prompt…</p> : null}
      {!loadingCard && !card ? (
        <p className="muted">No coding cards available for this deck.</p>
      ) : null}
      {!card ? null : (
        <>
          <section className="coding-review-layout">
            <div className="code-pane">
              <header>
                <h2>{card.prompt}</h2>
                <span className="lang-tag">{card.language}</span>
              </header>
              <CodeEditor value={card.code} readOnly language={card.language} minHeight={240} />
              <ExplainButton
                cardId={card.id}
                context={{
                  codeSnippet: card.code,
                  language: card.language,
                  mode: 'coding',
                  attempt: lastAttempt?.value,
                }}
              />
            </div>

            <div className="prediction-pane">
              <label htmlFor="prediction">Predicted Output</label>
              <textarea
                id="prediction"
                ref={textareaRef}
                value={prediction}
                onChange={(event) => setPrediction(event.target.value)}
                placeholder="What will the code produce?"
                disabled={awaitingRating}
              />
              <div className="prediction-actions">
                <button
                  type="button"
                  onClick={() => {
                    setPrediction('');
                    setCompareResult(null);
                  }}
                  className="subtle"
                  disabled={awaitingRating}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handleCompare()}
                  disabled={awaitingRating || comparing}
                >
                  {comparing ? 'Comparing…' : 'Compare Output'}
                </button>
              </div>
              {compareResult ? (
                <div className={`compare-panel ${compareResult.status}`}>
                  <header>
                    <h3>{compareResult.status === 'pass' ? 'Match!' : 'Keep iterating'}</h3>
                  </header>
                  {compareResult.status === 'fail' ? (
                    <>
                      <p className="muted">Mismatched lines highlighted below.</p>
                      <div className="diff-table">
                        {compareResult.diff.map((line) => (
                          <div key={line.line} className="diff-row">
                            <span className="diff-line">#{line.line}</span>
                            <pre className="expected">{line.expected || '␀'}</pre>
                            <pre className="actual">{line.actual || '␀'}</pre>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="muted">Great! Lock in a rating to schedule the next round.</p>
                  )}
                </div>
              ) : null}
              <div className={`rating-panel ${awaitingRating ? 'awaiting' : ''}`}>
                {[0, 1, 2, 3].map((score) => (
                  <button
                    key={score}
                    type="button"
                    disabled={!awaitingRating}
                    onClick={() => handleManualRate(score as RatingValue)}
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>
            <AssistantDrawer
              cardId={card.id}
              codeSnippet={card.code}
              attempt={lastAttempt?.value}
            />
          </section>

          <section className="expected-output">
            <header>
              <h3>Reference Output</h3>
            </header>
            <pre>{refExpected}</pre>
          </section>
        </>
      )}
    </div>
  );
}
