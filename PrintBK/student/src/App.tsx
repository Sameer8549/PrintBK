import React from 'react';
import { AppRouter } from './app/router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <div className="app" data-screen="entry">
          <AppRouter />
        </div>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
