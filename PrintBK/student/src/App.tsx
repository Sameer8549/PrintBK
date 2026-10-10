import React from 'react';
import { AppRouter } from './app/router';

export default function App() {
  return (
    <div className="app" data-screen="entry">
      <AppRouter />
    </div>
  );
}
