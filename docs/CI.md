# Build verification

Use Node.js 20 or newer.

```bash
npm install
npm run build
```

The repository previously included a GitHub Actions build workflow, but GitHub failed the job before assigning a runner (`runner_id: 0`) and before executing any step. The active workflow was removed so infrastructure-level runner failures do not produce misleading red checks on application commits.

When hosted runners are available, a normal CI job should run `npm install` followed by `npm run build` with non-secret placeholder environment values and checkout disabled.
