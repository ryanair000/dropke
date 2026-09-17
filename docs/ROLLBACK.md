# Production V2 rollback notes

## Application rollback

Do not remove the live V1 deployment until Production V2 preview checks pass. If a Production V2 deployment fails, restore the previous known-good Vercel deployment and keep checkout disabled.

## Database rollback principle

Do not manually delete Production V2 commercial tables simply because an application deploy is rolled back. The V1 runtime ignores them and they contain pricing/import history that may be needed for diagnosis.

The final admin service-boundary migration should only be applied after the matching server-side admin runtime is live. If that cutover must be reversed temporarily, restore authenticated execute grants only as an emergency compatibility measure, then return to the service-only boundary after the application issue is fixed.

Never roll back by exposing encrypted inventory tables or granting anon/authenticated direct table access.
