/**
 * UPILerify — Customer Checkout UTR Claim Endpoint
 *
 * Allows buyers on the checkout screen (/pay/[orderId]) to submit their
 * 12-digit UTR fallback reference without requiring an admin API key.
 *
 * Transitions the order to CLAIMED state. Never marks an order VERIFIED.
 * The order is only confirmed when a real bank alert arrives.
 *
 * RULES.md Compliance:
 *  - Rule 1 (SRP): Handles public UTR submission for a single order.
 *  - Rule 6 (< 300 lines): Compact and strictly typed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { orderManager } from '@/lib/engine/orderManager';
import { rateLimiters } from '@/lib/security/rateLimiter';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    // Rate limiting (5 requests/minute per IP)
    const forwarded = req.headers.get('x-forwarded-for');
    const clientIp = (forwarded ? forwarded.split(',')[0].trim() : '') || req.headers.get('x-real-ip') || 'unknown';
    const rateCheck = rateLimiters.verifyUtr.check(`claim-utr|${clientIp}`);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many UTR submission attempts. Please wait a moment.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { utr } = body;

    if (!utr || typeof utr !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A valid 12-digit UPI reference (UTR) is required.' },
        { status: 400 }
      );
    }

    const cleanUtr = utr.replace(/\D/g, '');
    if (cleanUtr.length !== 12) {
      return NextResponse.json(
        { success: false, error: 'Invalid UTR format. Must be exactly 12 numeric digits.' },
        { status: 400 }
      );
    }

    const result = await orderManager.verifyByManualUtr(orderId, cleanUtr);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      status: result.status,
      order: {
        id: result.order?.id,
        status: result.order?.status,
        claimedUtr: result.order?.claimedUtr,
        claimedAt: result.order?.claimedAt,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
