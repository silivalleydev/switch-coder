# Attribution

- **Replica Skill** (MIT) — https://github.com/Jakeschincariol/replica-skill
  The reference-app recon structure (screens / flows / entities / feature matrix / "cannot clone" / review-based angle),
  the brand sweep (`src/main/brand.ts`, adapted from `replica-brand/sweep.py`) and the priority-weighted parity score
  (adapted from `replica-diff/parity.py`). Re-implemented in TypeScript and compressed into tool-constrained JSON
  calls for small local models. Guardrails kept: public sources only, functionality and UX only, no code / logo /
  copy / name, mandatory rebrand sweep before launch.
- **ego-lite** (MIT) — https://github.com/citrolabs/ego-lite
  Inspiration for the browser QA step (an agent clicking through the built app). Implemented with Electron's own
  `webContents` (`src/main/browserqa.ts`); no code reused.
- **llama.cpp** (MIT), **Recursive Flint** (Apache 2.0), **isomorphic-git** (MIT), **npm** (Artistic 2.0), **Vercel CLI** (Apache 2.0).
