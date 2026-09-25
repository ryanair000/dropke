import 'server-only';
import { createHash } from 'node:crypto';
import { getServiceClient } from '@/lib/supabase/server';

function clientAddress(request: Request) {
  const forwarded = request.headers.get('x-vercel-forwarded-for')
    ?? request.headers.get('x-forwarded-for')
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  return forwarded.split(',')[0].trim().slice(0, 128);
}

export async function consumeRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
) {
  const key = createHash('sha256')
    .update(`${scope}:${clientAddress(request)}`)
    .digest('hex');
  const { data, error } = await getServiceClient().rpc('consume_api_rate_limit', {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_limit: limit,
  });
  if (error) throw new Error(`RATE_LIMIT_CHECK_FAILED:${error.message}`);
  return data === true;
}

export function rateLimitResponse() {
  return Response.json(
    { error: 'Too many requests. Please wait and try again.' },
    { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
  );
}
