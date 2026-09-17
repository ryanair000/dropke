import 'server-only';
import { getAuthenticatedServerClient, getServiceClient } from '@/lib/supabase/server';

export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requireAdmin(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new AdminAuthError('Sign in required', 401);

  const authClient = getAuthenticatedServerClient(request);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new AdminAuthError('Invalid or expired admin session', 401);

  const email = data.user.email?.toLowerCase();
  if (!email) throw new AdminAuthError('Admin account has no verified email', 403);

  // Authorization is checked with the server-only service client. Browser roles
  // never receive direct execute rights to privileged admin RPCs.
  const service = getServiceClient();
  const { data: allowed, error: allowError } = await service
    .from('admin_users')
    .select('email,active')
    .eq('email', email)
    .eq('active', true)
    .maybeSingle();

  if (allowError || !allowed) {
    throw new AdminAuthError('This account is not authorized for DROPKE admin', 403);
  }

  return { userId: data.user.id, email, supabase: service };
}

export function adminAuthResponse(reason: unknown) {
  if (reason instanceof AdminAuthError) {
    return Response.json({ error: reason.message }, { status: reason.status });
  }
  console.error('DROPKE admin request failed', reason);
  return Response.json({ error: 'Admin request failed' }, { status: 500 });
}
