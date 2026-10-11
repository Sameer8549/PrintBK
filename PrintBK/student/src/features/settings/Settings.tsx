import React, { useState } from 'react';
import { Icon, Topbar } from '../../components/ui';
import { Screen } from '../../lib/types';
import { notify } from '../../lib/store';
import { useBasket } from '../../store/basket';

function Settings({ go }: { go: (screen: Screen) => void }) {
  const [cleared, setCleared] = useState(false);
  const [phone, setPhone] = useState(() => localStorage.getItem('printbk-phone') || '');
  const [editingPhone, setEditingPhone] = useState(false);
  const basket = useBasket();

  const savePhone = () => {
    localStorage.setItem('printbk-phone', phone);
    setEditingPhone(false);
    notify('Phone number saved');
  };

  return (
    <main className="page" style={{ overflowY: 'auto' }}>
      <Topbar title="Settings" back onBack={() => go("entry")} />

      {/* ── Phone ── */}
      <div style={{ margin: '16px 16px 0', background: 'var(--color-surface,#fff)', borderRadius: 14, border: '1.5px solid var(--color-border,#e2e8f0)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
          <div>
            <strong style={{ display: 'block', fontSize: 15 }}>Phone number</strong>
            <small style={{ color: 'var(--color-secondary)', fontSize: 12 }}>{phone || 'Not added — for ready alerts'}</small>
          </div>
          <button
            style={{ background: 'none', border: '1.5px solid var(--color-border,#e2e8f0)', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
            onClick={() => setEditingPhone(!editingPhone)}
          >
            {editingPhone ? 'Cancel' : phone ? 'Change' : 'Add'}
          </button>
        </div>
        {editingPhone && (
          <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border,#e2e8f0)' }}>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              autoFocus
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--color-border,#e2e8f0)', fontSize: 15, marginTop: 12, marginBottom: 10, boxSizing: 'border-box' }}
            />
            <button
              className="primary full"
              style={{ width: '100%' }}
              onClick={savePhone}
              disabled={!phone.trim()}
            >
              Save number
            </button>
          </div>
        )}
      </div>

      {/* ── Links ── */}
      <div style={{ margin: '12px 16px 0', background: 'var(--color-surface,#fff)', borderRadius: 14, border: '1.5px solid var(--color-border,#e2e8f0)', overflow: 'hidden' }}>
        {[
          { label: 'Privacy policy', sub: 'How we handle your files', action: () => go('/privacy') },
          { label: 'About PrintBK', sub: 'Version 1.0 · Made for students', action: () => notify('PrintBK v1.0 · Built for HKBK Student Point') },
        ].map((item, i) => (
          <button
            key={item.label}
            onClick={item.action}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              borderTop: i > 0 ? '1px solid var(--color-border,#e2e8f0)' : 'none'
            }}
          >
            <span>
              <strong style={{ display: 'block', fontSize: 15 }}>{item.label}</strong>
              <small style={{ color: 'var(--color-secondary)', fontSize: 12 }}>{item.sub}</small>
            </span>
            <Icon name="chevron" />
          </button>
        ))}
      </div>

      {/* ── Danger zone ── */}
      <div style={{ margin: '12px 16px 0', background: 'var(--color-surface,#fff)', borderRadius: 14, border: '1.5px solid var(--color-border,#e2e8f0)', overflow: 'hidden' }}>
        <button
          disabled={cleared}
          onClick={() => {
            setCleared(true);
            basket.clear();
            // Clear all printbk localStorage keys
            Object.keys(localStorage).filter(k => k.startsWith('printbk')).forEach(k => localStorage.removeItem(k));
            notify('All local data cleared');
          }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', background: 'none', border: 'none', cursor: cleared ? 'default' : 'pointer', textAlign: 'left',
            opacity: cleared ? 0.5 : 1,
          }}
        >
          <span>
            <strong style={{ display: 'block', fontSize: 15, color: cleared ? 'inherit' : '#c53030' }}>
              {cleared ? 'Data cleared' : 'Clear my data from this device'}
            </strong>
            <small style={{ color: 'var(--color-secondary)', fontSize: 12 }}>
              {cleared ? 'This device is clean' : 'Removes basket, history and phone number'}
            </small>
          </span>
          {cleared ? <Icon name="check" /> : <Icon name="trash" />}
        </button>
      </div>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-secondary)', margin: '24px 0 40px', lineHeight: 1.6 }}>
        PrintBK v1.0 · HKBK Student Point · Bengaluru<br />
        Built for faster campus printing
      </p>
    </main>
  );
}
export default Settings;
