import React from 'react';

export function Toggle({ on, onChange }: any) {
  return <button className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}><i /></button>;
}

