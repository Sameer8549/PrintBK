import { PaymentStatusPage } from '../components/PaymentStatusPage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <PaymentStatusPage orderId={orderId} status="failed" />;
}
