import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';

export async function writeAudit(actorEmail: string, action: string, resource: string, details: Record<string, unknown> = {}) {
  await getServiceClient().from('audit_logs').insert({
    actor_email: actorEmail,
    action,
    resource,
    details,
  });
}
