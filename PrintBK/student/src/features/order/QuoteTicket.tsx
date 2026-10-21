import React from 'react';
import { Brand, Topbar } from '../../components/ui';
import { Screen, ServiceItem } from '../../lib/types';

function QuoteTicket({
  go,
  services
}: {
  go: (screen: Screen) => void;
  services: ServiceItem[];
}) {
  const requests = services.filter(service => service.mode === "request");
  const reqId = requests[0]?.id ? `#Q${requests[0].id.replace(/-/g, '').slice(-4).toUpperCase()}` : '#Q-PENDING';

  return (
    <main className="page ticket-page">
      <Topbar title={`Request ${reqId}`} back onBack={() => go("basket")} />
      <section className="order-ticket quote-ticket">
        <div className="ticket-brand"><Brand /><span>WAITING FOR QUOTE</span></div>
        <div className="quote-clock"><span>…</span></div>
        <div className="order-no"><span>REQUEST</span><b>{reqId}</b></div>
        <h2>We’re checking the details.</h2>
        <p>The shop will confirm the price before anything is printed or charged.</p>
        <div className="tear"><span style={{ borderTop: '2px dashed #94a3b8', display: 'block', width: '100%' }} /></div>
        <div className="ticket-files">
          {requests.map(service => (
            <div key={service.id}>
              <span>{service.name}<small>{service.detail}</small></span>
              <b>Quote pending</b>
            </div>
          ))}
        </div>
        <div className="dotted" />
        <div className="ticket-total"><span>Amount due now</span><b>₹0.00</b></div>
      </section>
      <div className="quote-notice">
        <b>Nothing to pay yet</b>
        <span>You’ll get a ready-to-review quote here.</span>
      </div>
      <button className="secondary-action full-width" onClick={() => go("entry")}>Back to home</button>
    </main>
  );
}

export default QuoteTicket;
