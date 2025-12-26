import { useCallback, useState } from 'react';
import type { InsightsResponseDTO } from '../../types/ipc';

interface InsightsPanelProps {
  cardId: number;
  sentence: string;
}

export function InsightsPanel({ cardId, sentence }: InsightsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<InsightsResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadInsights = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await window.api.getInsights(cardId, sentence);
      setInsights(response);
      setExpanded(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [cardId, sentence, loading]);

  const handleToggle = useCallback(() => {
    if (!insights && !loading) {
      loadInsights();
    } else {
      setExpanded((prev) => !prev);
    }
  }, [insights, loading, loadInsights]);

  return (
    <div className="insights-container">
      <button type="button" className="insights-toggle" onClick={handleToggle} disabled={loading}>
        {loading ? 'Loading insights...' : expanded ? 'Hide deeper insights' : 'Show deeper insights'}
      </button>

      {error && <p className="error">{error}</p>}

      {expanded && insights && (
        <div className="insights-panel">
          {insights.collocations.length > 0 && (
            <section className="insights-section">
              <h4>Collocations</h4>
              <ul>
                {insights.collocations.map((c, i) => (
                  <li key={i} className={`collocation-${c.assessment}`}>
                    <span className="collocation-original">"{c.original}"</span>
                    <span className={`collocation-badge ${c.assessment}`}>{c.assessment}</span>
                    {c.suggestion && (
                      <span className="collocation-suggestion">Try: {c.suggestion}</span>
                    )}
                    {c.note && <span className="collocation-note">{c.note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {insights.alternatives.length > 0 && (
            <section className="insights-section">
              <h4>Alternative Phrasings</h4>
              <ul>
                {insights.alternatives.map((a, i) => (
                  <li key={i}>
                    <span className="alternative-phrase">"{a.phrase}"</span>
                    {a.register && <span className={`register-badge ${a.register}`}>{a.register}</span>}
                    {a.nuance && <span className="alternative-nuance">{a.nuance}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {insights.registerNote && (
            <section className="insights-section">
              <h4>Register</h4>
              <p>{insights.registerNote}</p>
            </section>
          )}

          {insights.usagePatterns && insights.usagePatterns.length > 0 && (
            <section className="insights-section">
              <h4>Common Patterns</h4>
              <ul className="usage-patterns">
                {insights.usagePatterns.map((pattern, i) => (
                  <li key={i}>{pattern}</li>
                ))}
              </ul>
            </section>
          )}

          {insights.etymologyHint && (
            <section className="insights-section etymology">
              <h4>Memory Tip</h4>
              <p>{insights.etymologyHint}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
