import React from 'react';
import { Icon, Topbar } from '../../components/ui';
import { Screen } from '../../lib/types';
import { useHistory } from '../../store/basket';
import { notify } from '../../lib/store';

function History({
  go
}: {
  go: (screen: Screen) => void;
}) {
  const { orders } = useHistory();

  return <main className="page">
      <Topbar title="Order history" back onBack={() => go("entry")} />
      {orders.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 24px', gap: 16 }}>
          <h2 style={{ margin: 0, color: 'var(--color-primary)' }}>No orders yet</h2>
          <p style={{ color: 'var(--color-secondary)', margin: 0, textAlign: 'center' }}>
            Your print history will appear here after your first order.
          </p>
          <button className="primary" onClick={() => go("entry")}>Start printing</button>
        </div>
      ) : (
        <>
          <div className="section-heading"><h2>Past orders</h2><span>Last 30 days</span></div>
          {orders.map(order => (
            <section className="history-ticket" key={order.id}>
              <b>#{order.id.slice(-6).toUpperCase()}</b>
              <span>{new Date(order.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {order.files.length} file{order.files.length !== 1 ? 's' : ''}</span>
              <strong>₹{order.total.toFixed(2)}</strong>
              <button onClick={() => { notify("Reprint not available without original files"); }}>Reprint</button>
            </section>
          ))}
        </>
      )}
    </main>;
}
export default History;
