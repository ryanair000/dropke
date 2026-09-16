import { getServiceClient } from '@/lib/db';

export const OWNER_ADMIN_EMAIL = 'nitradefc24p@gmail.com';

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

  const supabase = getServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new AdminAuthError('Invalid or expired admin session', 401);

  const email = data.user.email?.toLowerCase();
  if (!email || !adminAllowlist().has(email)) {
    throw new AdminAuthError('This account is not authorized for DROPKE admin', 403);
  }

  return { userId: data.user.id, email };
}

export function adminAuthResponse(error: unknown) {
  if (error instanceof AdminAuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: 'Admin request failed' }, { status: 500 });
}
