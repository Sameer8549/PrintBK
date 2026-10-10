import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

function ReceiptSheet({
  setSheet,
  services
}: {
  setSheet: (sheet: Sheet) => void;
  services: ServiceItem[];
}) {
  const total = 86 + services.reduce((sum, service) => sum + (service.price ?? 0), 0);
  return <SheetShell tall onClose={() => setSheet(null)}>
      <div className="sheet-title"><div><span className="kicker">PAYMENT RECEIPT</span><h2>Order #1042</h2></div><span className="receipt-paid">Paid</span></div>
      <article className="pdf-receipt">
        <header><Brand full /><span>04 SEP 2025<br />12:42 PM</span></header>
        <div className="receipt-code"><span>ORDER</span><b>#1042</b><i>UPI</i></div>
        <div className="dotted" />
        <div className="pdf-lines"><div><span>Engineering Mathematics<small>6 sheets · mixed colour</small></span><b>₹18</b></div><div><span>Thermodynamics Lab<small>18 sheets · auto colour</small></span><b>₹54</b></div><div><span>ID card front<small>colour · exact size</small></span><b>₹14</b></div>{services.map(service => <div key={service.id}><span>{service.name}<small>{service.detail}</small></span><b>{service.price === null ? "Pending" : `₹${service.price}`}</b></div>)}</div>
        <div className="dotted" />
        <div className="pdf-total"><span>Total paid<small>UPI · ref 4821042</small></span><b>₹{total}.00</b></div>
        <div className="receipt-pickup"><span>PICKUP CODE</span><b>4821</b></div>
        <footer>HKBK Student Point · Bengaluru<br />Files auto-delete 10 minutes after printing.</footer>
      </article>
      <div className="receipt-actions"><button className="primary" onClick={() => printReceipt(services)}><Icon name="download" /> Save PDF</button><button onClick={() => shareReceipt(total)}><Icon name="share" /> Share</button></div>
      <button className="support-link" onClick={() => setSheet("report")}>Report a problem with this order</button>
    </SheetShell>;
}
export default ReceiptSheet;



