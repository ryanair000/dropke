import { getServiceClient } from '@/lib/db';

export async function writeAudit(actorEmail: string, action: string, resource: string, details: Record<string, unknown> = {}) {
  const supabase = getServiceClient();
  await supabase.from('audit_logs').insert({
    actor_email: actorEmail,
    action,
    resource,
    details,
  });
}
