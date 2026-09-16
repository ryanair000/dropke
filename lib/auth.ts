import 'server-only';
import { OWNER_ADMIN_EMAIL } from '@/lib/config';
import { getServiceClient } from '@/lib/supabase/server';

export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function adminAllowlist() {
  const extras = (process.env.DROPKE_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set([OWNER_ADMIN_EMAIL, ...extras]);
}

export async function requireAdmin(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new AdminAuthError('Sign in required', 401);

  const { data, error } = await getServiceClient().auth.getUser(token);
  if (error || !data.user) throw new AdminAuthError('Invalid or expired admin session', 401);

  const email = data.user.email?.toLowerCase();
  if (!email || !adminAllowlist().has(email)) {
    throw new AdminAuthError('This account is not authorized for DROPKE admin', 403);
  }
  return { userId: data.user.id, email };
}

export function adminAuthResponse(reason: unknown) {
  if (reason instanceof AdminAuthError) {
    return Response.json({ error: reason.message }, { status: reason.status });
  }
  console.error('DROPKE admin request failed', reason);
  return Response.json({ error: 'Admin request failed' }, { status: 500 });
}
