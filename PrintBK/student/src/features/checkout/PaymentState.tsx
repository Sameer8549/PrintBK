import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function PaymentState({
  type,
  go,
  total
}: {
  type: "confirming" | "paid";
  go: (screen: Screen) => void;
  total: number;
}) {
  useEffect(() => {
    if (type === "confirming") {
      const t = setTimeout(() => go("paid"), 1800);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => go("ticket"), 1600);
    return () => clearTimeout(t);
  }, [type, go]);
  return <main className="state-page">
      <Brand />
      <div className={`payment-visual ${type}`}>
        <div className="receipt-paper"><span /><span /><span /><b>₹{total}</b></div>
        {type === "paid" && <div className="paid-stamp">PAID<small>HKBK · 12:42</small></div>}
      </div>
      <h1>{type === "confirming" ? "Confirming payment" : "Payment done."}</h1>
      <p>{type === "confirming" ? "Keep this screen open for a moment." : "Your order just joined the print queue."}</p>
      {type === "confirming" && <div className="paper-feed wide"><span /></div>}
    </main>;
}
export default PaymentState;



