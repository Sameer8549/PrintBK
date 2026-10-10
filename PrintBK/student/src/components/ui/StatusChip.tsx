import React from 'react';

export function StatusChip({ status, queue, eta }: any) {
  return (
    <div className="status-chip">
      <i /> {status} <span>·</span> <b>{queue}</b> in queue <span>·</span> ~<b>{eta}</b> min
    </div>
  );
}

