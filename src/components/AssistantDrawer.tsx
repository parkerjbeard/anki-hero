import { useCallback, useMemo, useState } from 'react';
import type { PairAssistRequestFocus, PairAssistResponseDTO } from '../../types/ipc';

interface AssistantDrawerProps {
  cardId: number | null;
  codeSnippet: string;
  attempt?: string;
  openByDefault?: boolean;
}

interface AssistantAction {
  label: string;
  focus: PairAssistRequestFocus;
}

const ASSISTANT_ACTIONS: AssistantAction[] = [
  { label: 'Hint', focus: 'hint' },
  { label: 'Next step', focus: 'next' },
  { label: 'Why', focus: 'why' },
];

export function AssistantDrawer({
  cardId,
  codeSnippet,
  attempt,
  openByDefault = false,
}: AssistantDrawerProps) {
  const [open, setOpen] = useState(openByDefault);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<PairAssistResponseDTO[]>([]);

  const disabled = !cardId || !codeSnippet;

  const contextPayload = useMemo(
    () => ({
      codeContext: codeSnippet,
      attempt,
    }),
    [attempt, codeSnippet],
  );

  const handleAction = useCallback(
    async (focus: PairAssistRequestFocus) => {
      if (disabled || loading || !cardId) return;
      setLoading(true);
      setError(null);
      try {
        const response = await window.api.pairAssist(cardId, {
          focus,
          ...contextPayload,
        });
        setMessages((prev) => [...prev, response]);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [cardId, contextPayload, disabled, loading],
  );

  return (
    <aside className={`assistant-drawer ${open ? 'open' : ''}`}>
      <button type="button" className="assistant-toggle subtle" onClick={() => setOpen(!open)}>
        {open ? 'Close coach' : 'Open coach'}
      </button>
      {open ? (
        <div className="assistant-content">
          <header>
            <h3>Pair Assistant</h3>
            <p className="muted">Tap a prompt for a quick coaching nudge.</p>
          </header>
          <div className="assistant-actions">
            {ASSISTANT_ACTIONS.map((action) => (
              <button
                key={action.focus}
                type="button"
                disabled={disabled || loading}
                onClick={() => handleAction(action.focus)}
              >
                {loading ? 'Thinking…' : action.label}
              </button>
            ))}
          </div>
          {error ? <p className="error">{error}</p> : null}
          <div className="assistant-messages">
            {messages.length === 0 ? (
              <p className="muted">Ask for a hint to see suggestions.</p>
            ) : (
              messages.map((message, index) => (
                <article
                  key={`${message.type}-${index}`}
                  className={`assistant-card ${message.type}`}
                >
                  <header>
                    {message.type === 'hint'
                      ? 'Hint'
                      : message.type === 'next'
                        ? 'Next Step'
                        : 'Why'}
                  </header>
                  <p>{message.content}</p>
                  {message.suggestedEdit ? <pre>{message.suggestedEdit}</pre> : null}
                </article>
              ))
            )}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
