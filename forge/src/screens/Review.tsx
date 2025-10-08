import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FrontBackCard, JudgeResponseDTO, JudgeScoresDTO, RatingValue } from '../../types/ipc';
import { useAppStore } from '../state';

interface AttemptRecord extends JudgeResponseDTO {
  sentence: string;
}

const MAX_ATTEMPTS = 3;

function normalize(text: string) {
  return text.replace(/["'.!?]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function computeRating(scores: JudgeScoresDTO): RatingValue {
  const floor = Math.min(scores.meaning, scores.syntax);
  if (floor >= 0.9 && scores.collocation >= 0.85) {
    return 3;
  }
  return 2;
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
    if (!trimmed) return null;
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
  }, [sentence, lastAttempt, attempts]);

  const handleSubmit = useCallback(async () => {
    if (!card || !sentence.trim() || judging) return;

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

      if (result.verdict === 'right') {
        const rating = computeRating(result.scores);
        await window.api.rate(card.id, rating);
        await queryClient.invalidateQueries({ queryKey: ['decks'] });
        setSentence('');
        await loadNextCard();
        return;
      }

      if (result.verdict === 'wrong' && nextAttempts.length >= MAX_ATTEMPTS) {
        await window.api.rate(card.id, 0);
        await queryClient.invalidateQueries({ queryKey: ['decks'] });
        setSentence('');
        await loadNextCard();
        return;
      }

      if (result.verdict === 'unsure') {
        setError('New scene please — do not echo the last one.');
      } else if (result.verdict === 'wrong') {
        setError('Not quite. Try another sentence using the word naturally.');
      }
      setSentence('');
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setJudging(false);
    }
  }, [card, sentence, judging, duplicateWarning, attempts, loadNextCard, queryClient]);

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

  const backText = useMemo(() => {
    if (!card) return '';
    const temp = document.createElement('div');
    temp.innerHTML = card.backHtml;
    return temp.textContent ?? '';
  }, [card]);

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
          <h1>{card.targetLexeme}</h1>
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
        </div>
      </section>

      <section className="write-pane">
        <h2>Write it in a sentence</h2>
        <textarea
          ref={textareaRef}
          value={sentence}
          onChange={(event) => setSentence(event.target.value)}
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
      </section>

      {attempts.length > 0 ? (
        <section className="judge-panel">
          <h3>Feedback</h3>
          <ul>
            {attempts.map((attempt, index) => (
              <li key={index} className={`verdict-${attempt.verdict}`}>
                <div className="attempt-header">
                  <strong>{attempt.verdict.toUpperCase()}</strong>
                  <span>
                    meaning {(attempt.scores.meaning * 100).toFixed(0)} · syntax{' '}
                    {(attempt.scores.syntax * 100).toFixed(0)} · collocation{' '}
                    {(attempt.scores.collocation * 100).toFixed(0)}
                  </span>
                </div>
                <p className="sentence">“{attempt.sentence}”</p>
                <p className="feedback">{attempt.feedback}</p>
                {attempt.example ? <p className="example">Example: {attempt.example}</p> : null}
              </li>
            ))}
          </ul>
          {lastAttempt?.verdict === 'wrong' && attemptCount >= MAX_ATTEMPTS ? (
            <p className="hint">We’ll revisit this card soon. Moving on…</p>
          ) : null}
        </section>
      ) : null}

      <section className="rating-panel">
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

      <aside className="back-gist">
        <h4>Reference</h4>
        <p>{backText}</p>
      </aside>
    </div>
  );
}
