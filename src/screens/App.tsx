import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAppStore } from '../state';
import { DecksScreen } from './Decks';
import { ReviewScreen } from './Review';

const client = new QueryClient();

export function App() {
  const { activeScreen } = useAppStore();
  const screen = useMemo(() => {
    switch (activeScreen) {
      case 'review':
        return <ReviewScreen />;
      case 'decks':
      default:
        return <DecksScreen />;
    }
  }, [activeScreen]);

  return (
    <QueryClientProvider client={client}>
      <div className="app-shell">{screen}</div>
    </QueryClientProvider>
  );
}
