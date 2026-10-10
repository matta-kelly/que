---
type: spec
description: "Separate que's harness and UI into two peer apps in one repo, each with its own dependencies and checks, so a change to one does not install, lint or check the other. Reference for what the change must do and how it is checked."
status: factory
---
## Need

- one lockfile: a dependency change for one side changes a file the other side installs from
- one check job: every change runs every check
- the UI lints only because it borrows the root's TypeScript 6; alone it cannot lint
- the harness owns the repo root, so the two apps do not read as peers

## Done looks like

```
que/
├── justfile, .devcontainer/, .github/, scripts/, README.md, _well/, tests/e2e/
├── harness/   ← agent, platform, packages, evals; its package.json, lockfile, lint and format config
└── ui/        ← its package.json, lockfile, lint and format config
```

### Acceptance criteria

- `harness/` holds `agent`, `platform`, `packages` and `evals`, a `package.json` whose workspaces do not list the UI, and a lockfile
- `ui/` holds its own `package.json` and lockfile; the repo root has neither
- no file in `ui/` imports from outside `ui/`, and no code in `harness/` refers to the UI's folder
- the UI is on TypeScript 6, the same major version as the harness
- each app installs and passes its own checks with the other folder absent
- a pull request that changes only one app runs that app's checks and skips the other's; a change to a root file runs both
- the required check `checks` still gates main, and passes when one side is skipped
- on this spec's own pull request, `checks` passes
- `just check` passes, the end to end tests pass, and the evals pass every case

Checked in code review, by breaking it once on purpose:

- a throwaway pull request with a lint error in `ui/` fails `checks`, and the harness job is skipped

### Approach

- move `agent`, `platform`, `packages`, `evals`, `package.json`, `package-lock.json`, `eslint.config.ts` and `.prettierignore` into `harness/`, with `git mv`
	- every path between these folders is relative, so none of them change
- `harness/package.json`
	- `ui` leaves `workspaces`, and the `ui` script goes
	- the `overrides` stay
- `ui/` stands alone
	- `package.json` gains the lint and format tools; `typescript` moves to `^6.0.3`
		- the linter, typescript-eslint, supports TypeScript below 6.1 only
	- `eslint.config.ts`: the UI parts of today's config
		- react-hooks, browser globals, the `components/ui` ignore, the `markdown-text.tsx` override, `sonarjs/no-commented-code`
	- `.prettierignore`: `components/ui`, Markdown, the lockfile, build output
- both lockfiles are regenerated in the dev container
- root files that carry paths
	- `justfile`: every working directory and the test globs
	- `scripts/db.sh`: reads `harness/agent/.env`
	- `.devcontainer/devcontainer.json`: the packages volume mounts at `harness/node_modules`; the create command installs each app
	- `.gitignore`: the eval results path
	- `README.md`: the layout and the commands
- `.github/workflows/checks.yml`: the workflow keeps its name and always starts
	- `changes`: lists the changed paths with `git diff`
	- `harness` and `ui`: each runs only for its own paths, on a sparse checkout of its own folder
		- the sparse checkout is what proves each app works with the other absent
	- `checks`: runs always, and fails unless `harness` and `ui` each ended as success or skipped
		- a job skipped by a condition reports success, so one required name covers both apps
		- it also fails when `changes` fails, which would otherwise skip both apps and read as a pass
	- the ruleset on main is not changed
	- each job has a time limit of ten minutes

### Out of scope

- Dockerfiles and images
- a second repo
- a shared schema for the `/que` API: the UI keeps its copied types in `ui/lib/que-api.ts`
- any change to a test, an eval case, or how the code behaves
- a format check for the files left at the repo root

## Tests

- `tests/e2e/separation.sh`, run from the repo root on the host, on this spec's branch, with `just up` running and Odoo connected
	- one block per acceptance criterion, in the same order
	- fails today at the first block: there is no `harness/`
