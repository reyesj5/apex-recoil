# How to Contribute

We'd love to accept your patches and contributions to this project. There are just a few small guidelines you need to follow.

## Contributor License Agreement

Contributions to this project must be accompanied by a Contributor License Agreement. You (or your employer) retain the copyright to your contribution;
this simply gives us permission to use and redistribute your contributions as part of the project. Head over to [cla assistant](https://cla-assistant.io/metaflow/apex-recoil) to see your current agreements on file or to sign a new one.

You generally only need to submit a CLA once, so if you've already submitted one (even if it was for a different project), you probably don't need to do it again.

All submissions, including submissions by project members, require review. We use GitHub pull requests for this purpose. Consult [GitHub Help](https://help.github.com/articles/about-pull-requests/) for more information on using pull requests.

## Quality Gates & Testing

Before submitting a pull request, ensure all quality gates pass:
1. **Python Unit Tests & Shadow Parity:** `cd processing && python -m pytest tests && python -m recoil_discovery.shadow_parity`
2. **Schema Verification:** `cd processing && python -m recoil_discovery.cli verify`
3. **Node.js Test Suites:** `pnpm test` (or: `npm test`); with `docker compose up -d`, `pnpm test:services` also runs the Redis, S3 and end-to-end suites
4. **TypeScript Typecheck:** `pnpm tsc` (or: `npm run tsc`)
5. **Static & Bundle Build:** `pnpm build` (or: `npm run build` / `pnpm static`)

## Project Roadmap & AI Guidelines

- Check [docs/roadmap.md](./roadmap.md) to see active milestones and planned weapon updates.
- If you are using AI coding assistants or LLMs, ensure you adhere to the mandatory workflow in [AGENTS.md](../AGENTS.md).