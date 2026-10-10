import React from 'react';

export function Stepper({ value, onChange, min = 1 }: any) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <b>{value}</b>
      <button onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

