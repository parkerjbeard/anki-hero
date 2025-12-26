import { useCallback, useMemo, useState } from 'react';
import type { ExplainResponseDTO, StudyMode } from '../../types/ipc';

export interface ExplainContext {
  attempt?: string;
  codeSnippet?: string;
  language?: string;
  mode?: StudyMode;
}

interface ExplainButtonProps {
  cardId: number | null;
  disabled?: boolean;
  context?: ExplainContext;
  className?: string;
  buttonLabel?: string;
}

export function ExplainButton({
  cardId,
  disabled = false,
  context,
  className,
  buttonLabel = 'Explain',
}: ExplainButtonProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explain, setExplain] = useState<ExplainResponseDTO | null>(null);

  const effectiveDisabled = disabled || !cardId;

  const requestPayload = useMemo(() => {
    if (!context) return undefined;
    return {
      attempt: context.attempt,
      codeSnippet: context.codeSnippet,
      language: context.language,
      mode: context.mode,
    };
  }, [context]);

  const loadExplain = useCallback(async () => {
    if (!cardId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await window.api.explainCard(cardId, requestPayload);
      setExplain(response);
      setExpanded(true);
    } catch (err) {
      setError((err as Error).message);
      setExplain(null);
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  }, [cardId, loading, requestPayload]);

  const handleToggle = useCallback(() => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (explain) {
      setExpanded(true);
      return;
    }
    loadExplain().catch(() => {});
  }, [expanded, explain, loadExplain]);

  return (
    <div className={`explain-button ${className ?? ''}`}>
      <button type="button" disabled={effectiveDisabled || loading} onClick={handleToggle}>
        {loading ? 'Explaining…' : buttonLabel}
      </button>
      {expanded ? (
        <div className="explain-panel">
          {error ? (
            <p className="error">{error}</p>
          ) : explain ? (
            <>
              <header>
                <h3>{explain.title}</h3>
              </header>
              <ul>
                {explain.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {explain.snippet ? <pre>{explain.snippet}</pre> : null}
              <footer>
                <button
                  type="button"
                  className="subtle"
                  onClick={() => {
                    setExplain(null);
                    loadExplain().catch(() => {});
                  }}
                  disabled={loading}
                >
                  Refresh
                </button>
                <button type="button" className="subtle" onClick={() => setExpanded(false)}>
                  Close
                </button>
              </footer>
            </>
          ) : (
            <p className="muted">Nothing to explain yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
