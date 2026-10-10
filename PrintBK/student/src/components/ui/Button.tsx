import React from 'react';

export function Button({ variant = 'primary', full, className = '', children, ...props }: any) {
  const base = variant === 'primary' ? 'primary' : variant === 'secondary' ? 'secondary-action' : variant === 'quiet' ? 'quiet-action' : variant === 'text' ? 'text-button' : variant === 'icon' ? 'icon-button' : '';
  const fullClass = full ? 'full' : '';
  return <button className={[base, fullClass, className].filter(Boolean).join(' ')} {...props}>{children}</button>;
}

