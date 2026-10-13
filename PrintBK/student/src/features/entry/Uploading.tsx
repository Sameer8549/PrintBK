import React, { useState, useEffect } from 'react';
import { Icon, Brand, Topbar } from '../../components/ui';
import { Screen } from '../../lib/types';
import { useBasket } from '../../store/basket';
import type { PrintFile } from '../../store/basket';

function Uploading({ go }: { go: (screen: Screen) => void }) {
  const basket = useBasket();
  const addFile = useBasket(s => s.addFile);
  const [ready, setReady] = useState(basket.files.length > 0);

  useEffect(() => {
    if (basket.files.length > 0 && !ready) {
      setReady(true);
    }
    if (ready && basket.files.length > 0) {
      const t = setTimeout(() => go("basket"), 600);
      return () => clearTimeout(t);
    }
  }, [basket.files.length, ready, go]);

  return (
    <main className="page upload-page">
      <Topbar title="Preparing files" back onBack={() => go("entry")} />
      <div className="upload-heading">
        <span className="kicker">SMART CHECKS RUNNING</span>
        <h1>Getting everything print-ready.</h1>
        <p>You can fix anything before paying.</p>
      </div>

      {basket.files.length > 0 ? (
        <div className="upload-stack">
          {basket.files.map((file: PrintFile) => (
            <section key={file.id} className="upload-card complete">
              <span className="file-thumb">
                <Icon name="file" />
                <b>{(file.type || 'FILE').toUpperCase()}</b>
              </span>
              <div>
                <strong>{file.name}</strong>
                <small>{file.pages} page{file.pages !== 1 ? 's' : ''} · ready</small>
                <div className="progress"><i /></div>
              </div>
              <Icon name="check" />
            </section>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px', gap: 16 }}>
          <div className="paper-feed wide"><span /></div>
          <p style={{ color: 'var(--color-secondary)' }}>Waiting for files…</p>
        </div>
      )}

      <div className="upload-foot">
        <div className="scanner-line" />
        <span>Checking margins, colour pages and blanks</span>
      </div>
      <button
        className="primary full"
        disabled={basket.files.length === 0}
        onClick={() => go("basket")}
      >
        {basket.files.length === 0
          ? "Waiting for files…"
          : `Open basket (${basket.files.length} file${basket.files.length !== 1 ? 's' : ''})`}
      </button>
    </main>
  );
}
export default Uploading;
