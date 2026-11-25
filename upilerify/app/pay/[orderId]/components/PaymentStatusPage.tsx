import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CheckCircle2, CircleX, Clock, Ban, ShieldCheck } from 'lucide-react';
import { BrandBackground, BrandMarkSvg } from '@/lib/brand';
import { orderManager } from '@/lib/engine/orderManager';
import { SuccessRedirect } from './SuccessRedirect';

const statuses = {
  success: {
    title: 'Payment successful',
    description: 'Your payment has been verified. Thank you!',
    icon: CheckCircle2,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  failed: {
    title: 'Payment unsuccessful',
    description: 'Payment has not been confirmed. Check your UPI app before trying again.',
    icon: CircleX,
    color: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  expired: {
    title: 'Payment session expired',
    description: 'This payment session has ended. Contact the merchant for a new payment link.',
    icon: Clock,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  cancelled: {
    title: 'Checkout cancelled',
    description: 'You have left checkout. If you already paid, check the payment status before trying again.',
    icon: Ban,
    color: 'bg-slate-50 text-slate-700 border-slate-200',
  },
};

export type PaymentStatus = keyof typeof statuses;

export async function PaymentStatusPage({ orderId, status }: { orderId: string; status: PaymentStatus }) {
  const order = await orderManager.getOrder(orderId);
  if (!order) notFound();
  const checkoutUrl = `/pay/${encodeURIComponent(order.id)}`;

  // A URL alone must never be treated as proof of a successful payment.
  if (order.status === 'VERIFIED' && status !== 'success') redirect(`${checkoutUrl}/success`);
  if (order.status === 'EXPIRED' && status !== 'expired') redirect(`${checkoutUrl}/expired`);
  if (status === 'success' && order.status !== 'VERIFIED') redirect(checkoutUrl);
  if (status === 'expired' && order.status !== 'EXPIRED') redirect(checkoutUrl);

  const details = statuses[status];
  const Icon = details.icon;
  return (
    <main className="min-h-screen flex flex-col bg-slate-50 text-[#0A0F1D] font-sans">
      <BrandBackground variant="light-tactile" showGrid showArcs showGlow
        className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <section className="relative z-10 w-full max-w-md space-y-6 rounded-[2.5rem] border border-slate-200 bg-white/95 p-6 text-center shadow-xl sm:p-8">
          <div className="flex items-center justify-center gap-2">
            <BrandMarkSvg size={28} />
            <span className="text-sm font-bold">{order.merchantName}</span>
          </div>
          <div className={`rounded-2xl border p-6 space-y-3 ${details.color}`}>
            <Icon aria-hidden="true" className="mx-auto h-12 w-12" />
            <h1 className="text-2xl font-bold">{details.title}</h1>
            <p className="text-sm leading-relaxed">{details.description}</p>
          </div>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-slate-500">Amount</dt><dd className="text-3xl font-bold">₹{order.expectedAmount.toFixed(2)}</dd></div>
            <div><dt className="text-slate-500">Order ID</dt><dd className="break-all font-mono">{order.id}</dd></div>
            {status === 'success' && order.matchedUtr && (
              <div><dt className="text-slate-500">UTR</dt><dd className="break-all font-mono">{order.matchedUtr}</dd></div>
            )}
          </dl>
          {status === 'success' && order.redirectUrl && (
            <SuccessRedirect redirectUrl={order.redirectUrl} orderId={order.id} />
          )}
          {(status === 'failed' || status === 'cancelled') && (
            <Link href={checkoutUrl} className="block rounded-2xl bg-[#0A0F1D] px-4 py-3 text-sm font-bold text-white hover:bg-[#0066FF]">
              Return to checkout
            </Link>
          )}
          {status === 'expired' && <p className="text-xs text-slate-500">Already paid? Share your UTR and order ID with the merchant.</p>}
          <div className="flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-emerald-600" />
            Powered by UPIlerify
          </div>
        </section>
      </BrandBackground>
    </main>
  );
}
