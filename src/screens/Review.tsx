import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FrontBackCard, JudgeResponseDTO, RatingValue } from '../../types/ipc';
import { useAppStore } from '../state';
import { ExplainButton } from '../components/ExplainButton';
import { InsightsPanel } from '../components/InsightsPanel';

interface AttemptRecord extends JudgeResponseDTO {
  sentence: string;
}

const MAX_ATTEMPTS = 3;

function normalize(text: string) {
  return text
    .replace(/["'.!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, '').trim();
}

export function ReviewScreen() {
  const { selectedDeckId, setActiveScreen } = useAppStore();
  const queryClient = useQueryClient();
  const [card, setCard] = useState<FrontBackCard | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [isFront, setIsFront] = useState(true);
  const [sentence, setSentence] = useState('');
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [judging, setJudging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [awaitingRating, setAwaitingRating] = useState(false);
  const [showingFeedback, setShowingFeedback] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lastAttempt = attempts.at(-1) ?? null;
  const attemptCount = attempts.length;

  const loadNextCard = useCallback(async () => {
    if (!selectedDeckId) {
      return;
    }
    setLoadingCard(true);
    setError(null);
    setSentence('');
    setAttempts([]);
    setJudging(false);
    setAwaitingRating(false);
    setShowingFeedback(false);
    try {
      const next = await window.api.nextCard(selectedDeckId);
      setCard(next);
      setIsFront(true);
      setAudioUrls([]);
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
    if (!selectedDeckId) {
      return;
    }
    loadNextCard().catch((err) => setError((err as Error).message));
  }, [loadNextCard, selectedDeckId]);

  const handleManualRate = useCallback(
    async (rating: RatingValue) => {
      if (!card || judging) return;
      await window.api.rate(card.id, rating);
      await queryClient.invalidateQueries({ queryKey: ['decks'] });
      setAwaitingRating(false);
      await loadNextCard();
    },
    [card, judging, loadNextCard, queryClient],
  );

  const handlePlayAudio = useCallback(async () => {
    if (!card) return;
    let urls = audioUrls;
    if (urls.length === 0) {
      urls = await window.api.playAudio(card.id);
      setAudioUrls(urls);
    }
    const [first] = urls;
    if (!first) return;
    const audio = new Audio(first);
    await audio.play();
  }, [audioUrls, card]);

  const duplicateWarning = useMemo(() => {
    const trimmed = sentence.trim();
    if (!trimmed || awaitingRating || showingFeedback) return null;
    if (lastAttempt && normalize(lastAttempt.sentence) === normalize(trimmed)) {
      return 'Looks identical to your last sentence.';
    }
    if (
      attempts.some(
        (attempt) => attempt.example && normalize(attempt.example) === normalize(trimmed),
      )
    ) {
      return 'Avoid echoing the hint example.';
    }
    return null;
  }, [sentence, awaitingRating, lastAttempt, attempts]);

  const handleSubmit = useCallback(async () => {
    if (!card || !sentence.trim() || judging || awaitingRating || showingFeedback) return;

    if (duplicateWarning) {
      setError(duplicateWarning);
      return;
    }

    setJudging(true);
    setError(null);
    const trimmed = sentence.trim();
    try {
      const result = await window.api.judgeSentence(card.id, trimmed);
      const nextAttempts = [...attempts, { ...result, sentence: trimmed }];
      setAttempts(nextAttempts);
      setShowingFeedback(true);

      if (result.verdict === 'right') {
        setSentence('');
        setAwaitingRating(true);
        return;
      }

      if (result.verdict === 'wrong' && nextAttempts.length >= MAX_ATTEMPTS) {
        await window.api.rate(card.id, 0);
        await queryClient.invalidateQueries({ queryKey: ['decks'] });
        setSentence('');
        await loadNextCard();
        return;
      }

      setSentence('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setJudging(false);
    }
  }, [
    card,
    sentence,
    judging,
    awaitingRating,
    showingFeedback,
    duplicateWarning,
    attempts,
    loadNextCard,
    queryClient,
  ]);

  const handleTryAgain = useCallback(() => {
    setSentence('');
    setError(null);
    setShowingFeedback(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!card) return;
      const target = event.target as HTMLElement;
      const isTyping = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT');
      if (event.code === 'Space' && !isTyping) {
        event.preventDefault();
        setIsFront((prev) => !prev);
      }
      if (event.code === 'KeyA' && !isTyping) {
        event.preventDefault();
        handlePlayAudio().catch(() => {});
      }
      if (event.code === 'Enter' && isTyping && !event.shiftKey) {
        event.preventDefault();
        handleSubmit().catch(() => {});
      }
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code) && !isTyping) {
        const ratingMap: Record<string, RatingValue> = {
          Digit1: 0,
          Digit2: 1,
          Digit3: 2,
          Digit4: 3,
        };
        const rating = ratingMap[event.code];
        if (rating !== undefined) {
          handleManualRate(rating).catch(() => {});
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [card, handleManualRate, handlePlayAudio, handleSubmit]);

  if (!selectedDeckId) {
    return (
      <div className="screen review-screen">
        <p>No deck selected.</p>
        <button type="button" onClick={() => setActiveScreen('decks')}>
          Back to Decks
        </button>
      </div>
    );
  }

  if (loadingCard) {
    return (
      <div className="screen review-screen">
        <p>Loading card…</p>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="screen review-screen">
        <h2>All caught up 🎉</h2>
        <p>Nothing due right now. Come back later for another round.</p>
        <button type="button" onClick={() => setActiveScreen('decks')}>
          Back to Decks
        </button>
      </div>
    );
  }

  return (
    <div className="screen review-screen">
      <header className="review-header">
        <button type="button" onClick={() => setActiveScreen('decks')}>
          ← Decks
        </button>
        <div className="card-meta">
          <h1>{stripHtml(card.targetLexeme)}</h1>
          <span className="lang-tag">
            {card.lang.toUpperCase()}
            {card.pos ? ` · ${card.pos}` : ''}
          </span>
        </div>
        <button type="button" onClick={handlePlayAudio}>
          Play Audio
        </button>
      </header>

      <section className="card-pane">
        <div className={`card-face ${isFront ? 'front' : 'back'}`}>
          <article dangerouslySetInnerHTML={{ __html: isFront ? card.frontHtml : card.backHtml }} />
        </div>
        <div className="card-controls">
          <button type="button" onClick={() => setIsFront((prev) => !prev)}>
            {isFront ? 'Show Answer (Space)' : 'Show Question'}
          </button>
          <ExplainButton
            cardId={card.id}
            buttonLabel="Explain Concept"
            context={{
              mode: 'vocab',
              attempt: lastAttempt?.sentence,
              language: card.lang,
            }}
          />
        </div>
      </section>

      <section className="write-pane">
        <h2>Write it in a sentence</h2>
        {showingFeedback && lastAttempt ? (
          <div className={`feedback-card verdict-${lastAttempt.verdict}`}>
            <div className="feedback-card-header">
              <p className="result-status">
                {lastAttempt.verdict === 'right'
                  ? 'Correct!'
                  : lastAttempt.verdict === 'unsure'
                    ? 'Almost there—adjust your context.'
                    : 'Not quite—try again.'}
              </p>
              <span>
                form {(lastAttempt.scores.form * 100).toFixed(0)} · mechanics{' '}
                {(lastAttempt.scores.mechanics * 100).toFixed(0)} · grammar{' '}
                {(lastAttempt.scores.grammar * 100).toFixed(0)}
              </span>
            </div>
            {lastAttempt.qualityScores && lastAttempt.verdict !== 'wrong' && (
              <div className="quality-scores">
                <span className="quality-score" title="How interesting/creative">
                  style {(lastAttempt.qualityScores.style * 100).toFixed(0)}
                </span>
                <span className="quality-score" title="Native-like expression">
                  sophistication {(lastAttempt.qualityScores.sophistication * 100).toFixed(0)}
                </span>
                <span className="quality-score" title="Natural collocations">
                  naturalness {(lastAttempt.qualityScores.naturalness * 100).toFixed(0)}
                </span>
              </div>
            )}
            <p className="sentence">"{lastAttempt.sentence}"</p>
            <p className="feedback">{lastAttempt.feedback}</p>
            {lastAttempt.quickTip && <p className="quick-tip">{lastAttempt.quickTip}</p>}
            {lastAttempt.example ? <p className="example">Example: {lastAttempt.example}</p> : null}
            {lastAttempt.verdict === 'right' && card && (
              <InsightsPanel cardId={card.id} sentence={lastAttempt.sentence} />
            )}
            {awaitingRating ? null : (
              <button type="button" className="try-again" onClick={handleTryAgain}>
                Try again
              </button>
            )}
            {lastAttempt.verdict === 'wrong' && attemptCount >= MAX_ATTEMPTS ? (
              <p className="hint">We'll revisit this card soon. Moving on…</p>
            ) : null}
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={sentence}
              onChange={(event) => {
                setSentence(event.target.value);
              }}
              placeholder="Type your sentence here…"
              disabled={judging}
              rows={3}
            />
            <div className="write-actions">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={judging || !sentence.trim() || Boolean(duplicateWarning)}
              >
                {judging ? 'Checking…' : 'Submit (Enter)'}
              </button>
              <span className="attempts">
                Attempt {attemptCount + 1} of {MAX_ATTEMPTS}
              </span>
            </div>
            {duplicateWarning ? <p className="hint">{duplicateWarning}</p> : null}
            {error ? <p className="error">{error}</p> : null}
          </>
        )}
      </section>

      <section className={`rating-panel${awaitingRating ? ' awaiting' : ''}`}>
        <button type="button" onClick={() => handleManualRate(0)}>
          Again (1)
        </button>
        <button type="button" onClick={() => handleManualRate(1)}>
          Hard (2)
        </button>
        <button type="button" onClick={() => handleManualRate(2)}>
          Good (3)
        </button>
        <button type="button" onClick={() => handleManualRate(3)}>
          Easy (4)
        </button>
      </section>
    </div>
  );
}
