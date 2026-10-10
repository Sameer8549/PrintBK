import React from 'react';
import { AppRouter } from './app/router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="app" data-screen="entry">
        <AppRouter />
      </div>
    </QueryClientProvider>
  );
}
