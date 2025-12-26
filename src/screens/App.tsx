import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAppStore } from '../state';
import { DecksScreen } from './Decks';
import { ReviewScreen } from './Review';
import { ReviewCodeScreen } from './ReviewCode';

const client = new QueryClient();

export function App() {
  const { activeScreen, activeMode } = useAppStore();
  const screen = useMemo(() => {
    switch (activeScreen) {
      case 'review':
        return activeMode === 'coding' ? <ReviewCodeScreen /> : <ReviewScreen />;
      case 'decks':
      default:
        return <DecksScreen />;
    }
  }, [activeMode, activeScreen]);

  return (
    <QueryClientProvider client={client}>
      <div className="app-shell">{screen}</div>
    </QueryClientProvider>
  );
}
