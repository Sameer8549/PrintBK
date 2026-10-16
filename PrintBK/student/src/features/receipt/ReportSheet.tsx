import React, { useState } from 'react';
import { Icon, SheetShell } from '../../components/ui';
import { notify, printReceipt, shareReceipt } from '../../lib/store';
import { useHistory } from '../../store/basket';

function ReportSheet({
  close,
  orderId
}: {
  close: () => void;
  orderId?: string;
}) {
  const [problem, setProblem] = useState("");
  const [pages, setPages] = useState("");
  const { orders } = useHistory();
  const order = orderId ? orders.find(o => o.id === orderId) : orders[0];
  const orderNumStr = order?.orderNumber ? `#${order.orderNumber}` : (order?.id ? `#${order.id.slice(-6).toUpperCase()}` : "");

  return (
    <SheetShell onClose={close}>
      <div className="sheet-title">
        <div>
          {orderNumStr && <span className="kicker">ORDER {orderNumStr}</span>}
          <h2>Receipt & support</h2>
        </div>
      </div>
      <div className="action-pair">
        <button onClick={() => {
          if (!order) {
            notify("No order details available");
            return;
          }
          printReceipt({
            orderNumber: order.orderNumber || order.id.slice(-6).toUpperCase(),
            pickupCode: order.pickupCode,
            total: order.total,
            dateStr: new Date(order.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
            paymentMethod: order.paymentMethod
          });
        }}>
          <Icon name="download" /> Save PDF receipt
        </button>
        <button onClick={() => {
          if (!order) {
            notify("No order details available");
            return;
          }
          shareReceipt({
            orderNumber: order.orderNumber || order.id.slice(-6).toUpperCase(),
            pickupCode: order.pickupCode,
            total: order.total
          });
        }}>
          <Icon name="share" /> Share receipt
        </button>
      </div>
      <div className="dotted" />
      <label>Report a problem</label>
      <div className="report-list">
        {["Smudged page", "Missing page", "Wrong settings", "Other"].map(x => (
          <button className={problem === x ? "selected" : ""} onClick={() => setProblem(x)} key={x}>
            {x}<span>{problem === x ? "●" : "○"}</span>
          </button>
        ))}
      </div>
      <input className="range-input muted-input" value={pages} onChange={event => setPages(event.target.value)} placeholder="Page numbers (optional)" />
      <button className="primary full" disabled={!problem} onClick={() => {
        notify("Report sent. We’ll help at the counter.");
        close();
      }}>Send report</button>
    </SheetShell>
  );
}

export default ReportSheet;
