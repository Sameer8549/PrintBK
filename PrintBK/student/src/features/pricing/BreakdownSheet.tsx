import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function BreakdownSheet({
  close,
  services = []
}: {
  close: () => void;
  services?: ServiceItem[];
}) {
  const total = 86 + services.reduce((sum, service) => sum + (service.price ?? 0), 0);
  return <SheetShell onClose={close}>
      <div className="sheet-title"><div><span className="kicker">NO SURPRISES</span><h2>Price breakdown</h2></div></div>
      <div className="receipt-lines">
        <div><span>Engineering Mathematics <small>6 sheets · mixed colour</small></span><b>₹18</b></div>
        <div><span>Thermodynamics Lab <small>18 sheets · auto colour</small></span><b>₹54</b></div>
        <div><span>ID card front <small>colour · exact size</small></span><b>₹14</b></div>
        {services.map(service => <div className={service.price === null ? "pending-line" : ""} key={service.id}><span>{service.name}<small>{service.detail} · {service.label}</small></span><b>{service.price === null ? "Pending" : `₹${service.price}`}</b></div>)}
        <div className="discount"><span>2-up saving</span><b>−₹14</b></div>
        <div><span>Priority printing</span><b>₹14</b></div>
      </div>
      <div className="dotted" />
      <div className="grand-total"><span>Total</span><b>₹{total}.00</b></div>
      <div className="savings-tip">Keep 2-up on and save 14 sheets.</div>
      <button className="primary full" onClick={close}>Looks right</button>
    </SheetShell>;
}
export default BreakdownSheet;



