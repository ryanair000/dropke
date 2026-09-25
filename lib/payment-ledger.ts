import 'server-only';
import { createHash } from 'node:crypto';
import { getServiceClient } from '@/lib/supabase/server';

export type PaystackEvent = {
  event?: string;
  data?: {
    id?: string | number;
    reference?: string;
    status?: string;
    currency?: string;
    amount?: number;
  };
};

type PaymentOrder = { ref: string; kes_price: number | string };
type InitializedPayment = { data: { access_code: string; authorization_url: string } };
type PaymentEventStatus = 'received' | 'processed' | 'ignored' | 'failed';
export type PaymentEventRecord = { created: boolean; status: PaymentEventStatus };

export function shouldProcessPaymentEvent(entry: PaymentEventRecord) {
  return entry.created || (entry.status !== 'processed' && entry.status !== 'ignored');
}

export function paymentEventKey(rawBody: string, event: PaystackEvent) {
  const providerId = event?.data?.id;
  return providerId == null
    ? createHash('sha256').update(rawBody).digest('hex')
    : `${String(event.event ?? 'event')}:${String(providerId)}`;
}

export async function beginPaymentAttempt(order: PaymentOrder) {
  const supabase = getServiceClient();
  const { data: existing, error: readError } = await supabase
    .from('payment_attempts')
    .select('authorization_url,status')
    .eq('order_ref', order.ref)
    .eq('provider', 'paystack')
    .maybeSingle();
  if (readError) throw new Error(`PAYMENT_ATTEMPT_READ_FAILED:${readError.message}`);
  if (existing?.status === 'initialized' && existing.authorization_url) return existing;

  const { data, error } = await supabase
    .from('payment_attempts')
    .upsert({
      order_ref: order.ref,
      provider: 'paystack',
      provider_reference: order.ref,
      amount: Number(order.kes_price) * 100,
      currency: 'KES',
      status: 'initializing',
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'order_ref,provider' })
    .select('authorization_url,status')
    .single();
  if (error) throw new Error(`PAYMENT_ATTEMPT_WRITE_FAILED:${error.message}`);
  return data;
}

export async function markPaymentInitialized(orderRef: string, result: InitializedPayment) {
  const { error } = await getServiceClient()
    .from('payment_attempts')
    .update({
      status: 'initialized',
      access_code: String(result.data.access_code),
      authorization_url: String(result.data.authorization_url),
      initialized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('order_ref', orderRef)
    .eq('provider', 'paystack');
  if (error) throw new Error(`PAYMENT_ATTEMPT_UPDATE_FAILED:${error.message}`);
}

export async function markPaymentAttemptFailed(orderRef: string, reason: unknown) {
  const message = reason instanceof Error ? reason.message : 'PAYMENT_INITIALIZATION_FAILED';
  const { error } = await getServiceClient()
    .from('payment_attempts')
    .update({ status: 'failed', last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq('order_ref', orderRef)
    .eq('provider', 'paystack');
  if (error) console.error('DROPKE payment attempt failure could not be recorded', error);
}

export async function recordPaymentEvent(input: {
  key: string;
  orderRef?: string;
  eventType: string;
  providerStatus?: string;
  amount?: number;
  currency?: string;
}) {
  const { error } = await getServiceClient().from('payment_events').insert({
    provider: 'paystack',
    provider_event_key: input.key,
    order_ref: input.orderRef ?? null,
    event_type: input.eventType,
    provider_status: input.providerStatus ?? null,
    amount: input.amount ?? null,
    currency: input.currency ?? null,
  });
  if (!error) return { created: true, status: 'received' as PaymentEventStatus };
  if (error.code === '23505') {
    const { data, error: readError } = await getServiceClient()
      .from('payment_events')
      .select('processing_status')
      .eq('provider', 'paystack')
      .eq('provider_event_key', input.key)
      .single();
    if (readError) throw new Error(`PAYMENT_EVENT_READ_FAILED:${readError.message}`);
    return { created: false, status: data.processing_status as PaymentEventStatus };
  }
  throw new Error(`PAYMENT_EVENT_WRITE_FAILED:${error.message}`);
}

export async function finishPaymentEvent(key: string, status: 'processed' | 'ignored' | 'failed', errorMessage?: string) {
  const { error } = await getServiceClient()
    .from('payment_events')
    .update({
      processing_status: status,
      error: errorMessage?.slice(0, 500) ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq('provider', 'paystack')
    .eq('provider_event_key', key);
  if (error) throw new Error(`PAYMENT_EVENT_UPDATE_FAILED:${error.message}`);
}

export async function markPaymentAttemptPaid(orderRef: string) {
  const { error } = await getServiceClient()
    .from('payment_attempts')
    .update({ status: 'success', paid_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null })
    .eq('order_ref', orderRef)
    .eq('provider', 'paystack');
  if (error) throw new Error(`PAYMENT_ATTEMPT_PAID_FAILED:${error.message}`);
}
