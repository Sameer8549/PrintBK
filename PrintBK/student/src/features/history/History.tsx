import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function History({
  go
}: {
  go: (screen: Screen) => void;
}) {
  const [balance, setBalance] = useState(42);
  return <main className="page">
      <Topbar title="History & wallet" back onBack={() => go("entry")} />
      <section className="wallet-card"><span>PRINTBK WALLET</span><b>₹{balance}.00</b><button onClick={() => {
        setBalance(balance + 100);
        notify("₹100 added. ₹5 bonus is on us.");
      }}>Add money</button><small>You saved <strong>64 sheets</strong> this month.</small></section>
      <div className="section-heading"><h2>Past orders</h2><span>Last 30 days</span></div>
      {[["#1031", "Yesterday · 4 files", "₹112"], ["#1014", "12 Aug · 2 files", "₹46"], ["#0988", "04 Aug · 1 file", "₹18"]].map(x => <section className="history-ticket" key={x[0]}><b>{x[0]}</b><span>{x[1]}</span><strong>{x[2]}</strong><button onClick={() => go("basket")}>Reprint</button></section>)}
    </main>;
}
export default History;



