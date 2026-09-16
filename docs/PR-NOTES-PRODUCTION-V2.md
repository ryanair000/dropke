# Production V2 review notes

This branch is intentionally not merged directly into `main` yet.

Review focus:

- database migration ordering and reproducibility;
- server-only quote stock reads;
- product/platform/region pricing now coming from Postgres;
- KSh-first wallet routing;
- admin service-role cutover sequencing;
- checkout remains disabled.

Known external blocker: GitHub-hosted Actions jobs are currently failing before a runner is assigned (`runner_id: 0`, no job steps). This is an infrastructure/repository Actions issue rather than an application test result. Use Vercel/local build validation before promoting this branch.
