'use client';

import { useEffect, useState } from 'react';
import { buildSuccessRedirectUrl } from '@/lib/payments/redirect';

export function SuccessRedirect({ redirectUrl, orderId }: { redirectUrl: string; orderId: string }) {
  const destination = buildSuccessRedirectUrl(redirectUrl, orderId);
  const [seconds, setSeconds] = useState(3);

  useEffect(() => {
    if (!destination) return;
    setSeconds(3);
    const deadline = Date.now() + 3000;
    const timer = setInterval(() => {
      setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 200);
    const redirect = setTimeout(() => window.location.assign(destination), 3000);
    return () => {
      clearInterval(timer);
      clearTimeout(redirect);
    };
  }, [destination]);

  if (!destination) return null;

  return (
    <div className="space-y-3">
      <p role="status" aria-live="polite" className="text-sm text-slate-600">
        Redirecting in {seconds} {seconds === 1 ? 'second' : 'seconds'}…
      </p>
      <progress aria-label="Time before redirect" max={3} value={3 - seconds}
        className="h-2 w-full accent-emerald-600" />
      <a href={destination} className="block rounded-2xl bg-[#0A0F1D] px-4 py-3 text-sm font-bold text-white hover:bg-[#0066FF]">
        Return to merchant now
      </a>
    </div>
  );
}
