import React, { useEffect } from 'react';
import { AppRouter } from './app/router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initShopConfigPolling } from './store/shopConfig';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

const queryClient = new QueryClient();

export default function App() {
  useEffect(() => {
    initShopConfigPolling();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <div className="app" data-screen="entry">
          <AppRouter />
        </div>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
