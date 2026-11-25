'use client';

import React, { useState } from 'react';
import { HelpCircle, ChevronDown, Check, Loader2, AlertCircle } from 'lucide-react';

interface UtrClaimFormProps {
  orderId: string;
  onClaimed?: () => void;
}

export function UtrClaimForm({ orderId, onClaimed }: UtrClaimFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [utr, setUtr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const clean = utr.replace(/\D/g, '');
    if (clean.length !== 12) {
      setError('UTR must be exactly 12 numeric digits.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/claim-utr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utr: clean }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        if (onClaimed) onClaimed();
      } else {
        setError(data.error || 'Failed to submit UTR.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error submitting UTR.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-center space-y-1">
        <div className="flex items-center justify-center gap-1.5 text-sky-800 text-xs font-semibold">
          <Check className="w-4 h-4 text-sky-600" />
          <span>UTR Submitted</span>
        </div>
        <p className="text-[11px] text-sky-700">
          Your reference <span className="font-mono font-bold">{utr}</span> is recorded. Confirming automatically once your bank alert arrives.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-slate-50/50 transition-all">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
          <span>Paid but not confirming? Enter UTR</span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <form onSubmit={handleSubmit} className="px-4 pb-3.5 pt-1 space-y-2.5 border-t border-slate-200/60">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Find the 12-digit UPI Reference Number / RRN in your payment app (Google Pay, PhonePe, Paytm).
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={12}
              value={utr}
              onChange={(e) => {
                setUtr(e.target.value.replace(/\D/g, ''));
                if (error) setError(null);
              }}
              placeholder="e.g. 423456789012"
              className="flex-1 px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0066FF] focus:border-transparent text-slate-900"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || utr.length !== 12}
              className="px-4 py-2 rounded-xl bg-[#0A0F1D] hover:bg-[#0066FF] disabled:bg-slate-300 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow-xs"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <span>Submit</span>
              )}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-rose-600 text-[11px] font-medium pt-0.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
