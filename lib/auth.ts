import 'server-only';
import { getAuthenticatedServerClient } from '@/lib/supabase/server';

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

  const supabase = getAuthenticatedServerClient(request);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new AdminAuthError('Invalid or expired admin session', 401);

  const email = data.user.email?.toLowerCase();
  if (!email) throw new AdminAuthError('Admin account has no verified email', 403);

  const { data: allowed, error: allowError } = await supabase.rpc('is_dropke_admin');
  if (allowError || allowed !== true) {
    throw new AdminAuthError('This account is not authorized for DROPKE admin', 403);
  }

  return { userId: data.user.id, email, supabase };
}

export function adminAuthResponse(reason: unknown) {
  if (reason instanceof AdminAuthError) {
    return Response.json({ error: reason.message }, { status: reason.status });
  }
  console.error('DROPKE admin request failed', reason);
  return Response.json({ error: 'Admin request failed' }, { status: 500 });
}
