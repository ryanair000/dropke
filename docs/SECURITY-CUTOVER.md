# Admin security cutover

This runbook prevents the admin runtime and database permissions from being changed in the wrong order.

## Before cutover

1. Vercel must have a valid `SUPABASE_SERVICE_ROLE_KEY` secret for the DROPKE project.
2. The deployed Next.js build must include the Production V2 `lib/auth.ts` flow that verifies the Supabase bearer token, checks `admin_users` through the server service client, and uses that service client for privileged admin RPCs.
3. Confirm `/api/admin/summary` returns 401 without a bearer token.
4. Confirm the allowlisted owner can sign in and load Admin V1 on a preview deployment.

## Database cutover

Apply `20260916225300_production_v2_admin_service_boundary.sql` only after the application checks above pass.

The migration:

- removes `authenticated` execution rights from privileged `SECURITY DEFINER` admin RPCs;
- keeps privileged execution on `service_role` only;
- passes the verified actor email explicitly to mutating SKU and batch functions for audit logging;
- rechecks mutating actor emails against `admin_users` as defense in depth.

## After cutover

1. Run the Supabase Security Advisor.
2. Confirm there are no unintended anon/authenticated SECURITY DEFINER warnings.
3. Confirm owner admin login still works.
4. Confirm unauthorized authenticated users receive 403 from DROPKE admin APIs.
5. Keep checkout and real inventory disabled until inventory-key hardening and payment testing are complete.
