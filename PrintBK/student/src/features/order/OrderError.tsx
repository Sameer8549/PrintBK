import React, { useState } from 'react';
import { Brand } from '../../components/ui';
import { Screen } from '../../lib/types';
import { notify } from '../../lib/store';

function OrderError({
  go,
  total,
  orderNumber
}: {
  go: (screen: Screen) => void;
  total?: number;
  orderNumber?: number | string;
}) {
  const [waiting, setWaiting] = useState(false);
  const kicker = orderNumber ? `ORDER #${orderNumber} · PAUSED` : "ORDER PAUSED";

  return (
    <main className="state-page failure-state">
      <Brand />
      <div className="jam-visual"><div className="printer-box"><span /><i /></div><b>!</b></div>
      <span className="kicker">{kicker}</span>
      <h1>{waiting ? "We’ll keep your place." : "Paper jam. We’re fixing it."}</h1>
      <p>{waiting ? "Your order is still next. We’ll alert you when printing resumes." : "Nothing is lost and you won’t be charged twice."}</p>
      <button className="primary" onClick={() => go("ticket")}>{waiting ? "Track my order" : "Retry now"}</button>
      <button className="secondary-action" onClick={() => setWaiting(true)}>Wait and alert me</button>
      <button className="quiet-action" onClick={() => {
        notify("Please visit the counter for immediate assistance or manual receipt");
        go("history");
      }}>Assistance at counter</button>
    </main>
  );
}

export default OrderError;
