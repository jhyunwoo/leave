# Agent instructions

## Browser verification

Use the project-local `agent-browser` whenever a web UI is changed or the user asks to inspect the rendered result. The matching skill is installed in `.agents/skills/agent-browser`; load its current instructions with `pnpm exec agent-browser skills get core` before the first browser command in a task.

Targets:

- User web app: start `pnpm dev:web`, then open `http://localhost:5173`.
- Admin app: start `pnpm dev:admin`, then open `http://localhost:5174`.
- API and API docs: `http://localhost:8787` and `http://localhost:8787/docs`.

Use an isolated session derived from the worktree when practical. The basic verification loop is:

1. Start the relevant dev server in a persistent terminal and wait until its URL responds.
2. Run `pnpm exec agent-browser open <url>`.
3. Run `pnpm exec agent-browser wait --load networkidle` and `pnpm exec agent-browser snapshot -i`.
4. Exercise the changed flow, taking a fresh snapshot after navigation or dynamic UI changes.
5. Check `pnpm exec agent-browser console` and `pnpm exec agent-browser errors`, and capture a screenshot when visual evidence is useful.
6. Run `pnpm browser:close` when finished.

Do not place credentials in shell arguments or commit browser state and screenshots containing sensitive data. Existing Playwright suites remain the source for repeatable e2e tests; `agent-browser` is for agent-driven inspection and exploratory verification.
