import { NextRequest, NextResponse } from 'next/server';
import { orderManager } from '@/lib/engine/orderManager';
import { MicroOffsetCapacityError } from '@/lib/engine/microOffsetManager';
import { validateWebhookUrl } from '@/lib/security/urlValidator';
import { isValidRedirectUrl } from '@/lib/payments/redirect';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { amount, merchantUpiId, merchantName, useMicroOffset, webhookUrl, redirectUrl, customNote, customerEmail, metadata } = body;

    if (redirectUrl !== undefined && !isValidRedirectUrl(redirectUrl)) {
      return NextResponse.json(
        { success: false, error: 'redirectUrl must be an absolute HTTP or HTTPS URL without credentials.' },
        { status: 400 }
      );
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json(
        { success: false, error: 'A valid payment amount greater than 0 is required.' },
        { status: 400 }
      );
    }

    // SECURITY FIX (Phase 4): webhook targets are SSRF-validated BEFORE being
    // stored. If none is provided, fall back to the server-configured URL.
    const effectiveWebhookUrl = webhookUrl || process.env.WEBHOOK_URL;
    if (effectiveWebhookUrl) {
      const urlCheck = await validateWebhookUrl(effectiveWebhookUrl);
      if (!urlCheck.valid) {
        return NextResponse.json(
          { success: false, error: urlCheck.error },
          { status: 400 }
        );
      }
    }

    const { order, upiIntentUri } = await orderManager.createOrder({
      amount: Number(amount),
      merchantUpiId,
      merchantName,
      useMicroOffset: !!useMicroOffset,
      webhookUrl: effectiveWebhookUrl,
      redirectUrl,
      customNote,
      customerEmail,
      metadata,
    });

    // SECURITY: the create response must not echo sensitive fields either.
    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        merchantUpiId: order.merchantUpiId,
        merchantName: order.merchantName,
        baseAmount: order.baseAmount,
        expectedAmount: order.expectedAmount,
        refNote: order.refNote,
        status: order.status,
        createdAt: order.createdAt,
        expiresAt: order.expiresAt,
        redirectUrl: order.redirectUrl,
      },
      upiIntentUri,
      checkoutUrl: `/pay/${order.id}`,
    });
  } catch (err: any) {
    if (err instanceof MicroOffsetCapacityError || err.name === 'MicroOffsetCapacityError') {
      return NextResponse.json({ success: false, error: err.message }, { status: 429 });
    }
    console.error('[API /api/orders/create] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
