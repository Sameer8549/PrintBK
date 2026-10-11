import React, { useEffect } from 'react';
import { Brand } from '../../components/ui';
import { Screen } from '../../lib/types';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';

function PaymentState({
  go
}: {
  go: (screen: Screen) => void;
}) {
  const { id } = useParams<{ id: string }>();

  const [step, setStep] = React.useState('Verifying UPI transaction…');

  useEffect(() => {
    if (id && !id.startsWith('local-')) {
      api.payOrder(id).catch(err => console.warn('Could not update order payment status on server:', err));
    }
    const t1 = setTimeout(() => setStep('Locking in print order…'), 1000);
    const t2 = setTimeout(() => setStep('Generating pickup code…'), 2000);
    const t3 = setTimeout(() => go(`/order/${id}`), 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [id, go]);

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', background: '#f7f4ee' }}>
      <div style={{ maxWidth: 360, width: '100%', background: '#fff', borderRadius: 24, padding: '36px 24px', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Animated Loader Circle */}
        <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 24 }}>
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            border: '4px solid #e2e8f0',
            borderTopColor: '#10b981',
            animation: 'spin 1s linear infinite'
          }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
            ⚡
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', color: '#0b1020' }}>Confirming Payment</h1>
        <p style={{ fontSize: 14, color: '#718096', margin: '0 0 24px', minHeight: 20 }}>{step}</p>

        {/* Progress bar */}
        <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{
            height: '100%',
            background: '#10b981',
            borderRadius: 99,
            animation: 'loadProgress 3s ease-out forwards'
          }} />
        </div>

        <p style={{ fontSize: 12, color: '#a0aec0', margin: 0 }}>Keep this window open. Do not close.</p>
        
        {/* Skip button in case of slow networks */}
        <button
          onClick={() => go(`/order/${id}`)}
          style={{ marginTop: 24, background: 'none', border: 'none', color: '#3b82f6', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Taking too long? View ticket now →
        </button>
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes loadProgress { 0% { width: 5%; } 50% { width: 60%; } 100% { width: 100%; } }
      `}</style>
    </main>
  );
}
export default PaymentState;
