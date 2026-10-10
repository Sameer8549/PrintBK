import React from 'react';

export function Chip({ active, children, onClick, className = '' }: any) {
  return <button className={`${active ? 'active' : ''} ${className}`} onClick={onClick}>{children}</button>;
}

