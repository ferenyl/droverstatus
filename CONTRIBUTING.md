# Contributing

1. Fork and branch from `main`.
2. `npm install`
3. Make a small, focused change that follows the surrounding code style (see `.editorconfig`).
4. Before opening a PR, run:
   ```
   npm run typecheck
   npm test
   npx playwright install chromium   # once
   npm run test:e2e -- npx playwright test
   ```
   E2E runs against `testkit/fixtures` with a fake `drover.sh` and `zellij`; it never touches real corrals.
5. Update `CHANGELOG.md` for user-visible changes.

By contributing you agree your work is licensed under GPL-3.0-only.
