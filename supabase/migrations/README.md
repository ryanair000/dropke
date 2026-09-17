# DROPKE Supabase migrations

This directory mirrors the production Supabase migration ledger by timestamp.

Rules:

- Never rename, rewrite, or delete a migration that has already been applied to production.
- Add every schema change as a new timestamped migration.
- Keep operational pricing-feed imports and supplier inventory out of schema migrations.
- Test new migrations against a fresh database or Supabase branch before production deployment.
- The filename timestamp must match the migration version recorded by Supabase production.

Current production lineage starts at `20260916173354_dropke_initial_schema.sql` and continues in timestamp order.

The pricing feed is operational data. Its schema lives in the migrations, but uploaded feed rows themselves are not committed to Git because they are time-sensitive observations rather than schema state.
