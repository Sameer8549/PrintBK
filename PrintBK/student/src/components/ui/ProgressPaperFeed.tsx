import React from 'react';

export function ProgressPaperFeed({ wide }: { wide?: boolean }) {
  return <div className={`paper-feed ${wide ? 'wide' : ''}`}><span /></div>;
}

