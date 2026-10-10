import React from 'react';
import { Icon } from './Icon';

export function InlineWarning({ title, copy, onClick }: any) {
  return (
    <button className="printer-note" onClick={onClick}>
      <span>{title}</span><p>{copy}</p><Icon name="chevron" size={16} />
    </button>
  );
}

