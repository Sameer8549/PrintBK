import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Brand, Topbar, Segmented, SheetShell, Button, Toggle, Stepper, Chip, ProgressPaperFeed, StatusChip, PriceBar, InlineWarning } from '../../components/ui';
import { Screen, Sheet, ServiceItem } from '../../lib/types';
import { files, notify, browseFiles, scanPages, printReceipt, shareReceipt } from '../../lib/store';

import { api } from '../../services/api';
import { useBasket } from '../../store/basket';

function Checkout({
  go,
  setSheet,
  services
}: {
  go: (screen: Screen) => void;
  setSheet: (sheet: Sheet) => void;
  services: ServiceItem[];
}) {
  const [payment, setPayment] = useState("UPI");
  const [phone, setPhone] = useState("");
  const basket = useBasket();
  const total = 86 + services.reduce((sum, service) => sum + (service.price ?? 0), 0); // Mock total for now until we fully wire breakdown

  const [loading, setLoading] = useState(false);

  const pay = async () => {
    if (payment === "Wallet") return go("failed");
    setLoading(true);
    try {
      // 1. Create order
      const { orderId } = await api.createOrder({ files: basket.files, services: basket.services as any, rush: false });
      
      // 2. Clear basket
      basket.clear();

      // 3. Route to proper flow
      if (payment === "Cash") {
        notify("Order reserved. Pay at the counter.");
        return go(`/order/${orderId}`);
      }
      go(`/pay/${orderId}`);
    } catch (err) {
      notify("Failed to place order. Try again.");
    } finally {
      setLoading(false);
    }
  };
  return <main className="page has-dock">
      <Topbar title="Checkout" back onBack={() => go("basket")} />
      <section className="checkout-ticket">
        <div className="ticket-top"><Brand /><span>HKBK Student Point</span></div>
        <div className="dotted" />
        <div className="summary-line"><span>3 files</span><b>31 sheets</b></div>
        {services.map(service => <div className="summary-line service-summary" key={service.id}><span>{service.name}<small>{service.label}</small></span><b>{service.price === null ? "Pending" : `₹${service.price}`}</b></div>)}
        <div className="summary-line"><span>Total</span><b>₹{total}.00</b></div>
        <button className="link-row" onClick={() => setSheet("breakdown")}>See full price breakdown <Icon name="chevron" size={16} /></button>
      </section>
      <label className="field-label">Get a ready alert <small>optional</small></label>
      <div className="phone-field"><span>+91</span><input inputMode="tel" value={phone} onChange={event => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Phone number" /><i>{phone.length === 10 ? "Alert on" : "Not saved"}</i></div>
      <section className="payment-section">
        <span className="kicker">PAYMENT</span>
        <button className={`payment-row ${payment === "UPI" ? "selected" : ""}`} onClick={() => setPayment("UPI")}><span className="pay-icon">UPI</span><span><strong>Pay by UPI</strong><small>GPay · PhonePe · Paytm</small></span><i /></button>
        <button className={`payment-row ${payment === "Wallet" ? "selected" : ""}`} onClick={() => setPayment("Wallet")}><span className="pay-icon">₹</span><span><strong>PrintBK wallet</strong><small>Balance ₹42 · Add ₹100, get ₹5 extra</small></span><i /></button>
        <button className={`payment-row ${payment === "Cash" ? "selected" : ""}`} onClick={() => setPayment("Cash")}><span className="pay-icon">CA</span><span><strong>Pay cash at counter</strong><small>Printing starts after payment</small></span><i /></button>
      </section>
      <div className="trust-note"><Icon name="check" size={16} /> Files are encrypted and auto-deleted.</div>
      <div className="bottom-dock vertical"><button className="primary full" onClick={pay}>{payment === "Cash" ? "Reserve and pay at counter" : payment === "Wallet" ? `Pay ₹${total} from wallet` : `Pay ₹${total} and print instantly`}</button><small>{payment === "Wallet" ? "Your wallet may need a top-up." : "Paid orders print automatically."}</small></div>
    </main>;
}
export default Checkout;



