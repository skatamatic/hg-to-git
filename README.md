# hg-to-git

Convert Mercurial repositories to Git with **full history fidelity** (commits, messages, branches, tags) and **incremental sync** when Mercurial moves forward.

This tool orchestrates [frej/fast-export](https://github.com/frej/fast-export) (`hg-fast-export.py` + `git fast-import`), the standard approach for production hg→git migrations. Incremental state lives in the Git repo under `.git/hg2git-*` — the same mechanism fast-export uses natively.

---

## Table of contents

- [Ways to run](#ways-to-run)
- [Requirements](#requirements)
- [First-time setup](#first-time-setup)
  - [End users (installer)](#end-users-installer)
  - [Developers (from source)](#developers-from-source)
- [Preparing repositories](#preparing-repositories)
- [Your first conversion](#your-first-conversion)
- [Incremental sync and resume](#incremental-sync-and-resume)
- [Desktop app](#desktop-app)
- [Headless CLI](#headless-cli)
- [Configuration](#configuration)
- [Branch, tag, and author mapping](#branch-tag-and-author-mapping)
- [Building a redistributable](#building-a-redistributable)
- [Development](#development)
- [Testing](#testing)
- [Architecture](#architecture)
- [Correctness and troubleshooting](#correctness-and-troubleshooting)
- [License](#license)

---

## Ways to run

| Who | Install | Run |
|-----|---------|-----|
| **End user** | Windows installer (`.exe` / NSIS) from `npm run electron:pack` | Desktop app — **no Node, no npm** |
| **End user (CLI)** | Same installer | `hg-to-git-cli.cmd` or `hg-to-git.exe --cli …` |
| **Developer** | Clone repo + Node 18+ | `npm run electron:dev` (GUI) or `hg-to-git` (CLI) |
| **CI / automation** | Node + `npm install` + build | `hg-to-git --json …` |

The desktop app and packaged CLI bundle Node inside Electron. **Git, Mercurial, and Python + mercurial** must still be installed on the machine — hg-to-git orchestrates them; it does not replace them.

---

## Requirements

| Tool | Notes |
|------|--------|
| **Git** | 2.x+, on `PATH` |
| **Mercurial** | `hg` on `PATH` — must be a **local clone** (clone remotes first) |
| **Python** | 3.7+ with `pip install mercurial` |
| **Node.js** | 18+ — **developers and CI only**, not required for the packaged app |

**Windows:** Git for Windows, Mercurial ([TortoiseHg](https://tortoisehg.bitbucket.io/) or `choco install mercurial`), Python 3.

**Before the first import on Windows/macOS:** set `git config core.ignoreCase false` in the Git target (the app and CLI can fix this automatically).

---

## First-time setup

### End users (installer)

1. Obtain the installer from your team’s build (`release/` after `npm run electron:pack`) or a release download.
2. Run the installer. Choose an install directory (e.g. `C:\Program Files\hg-to-git\`).
3. Install **Git**, **Mercurial**, and **Python + mercurial** if not already present. Open the app → it will report missing tools and can offer to install some via winget on Windows.
4. Launch **hg-to-git** from the Start menu.

**Optional CLI** (same install, no npm):

```powershell
cd "C:\Program Files\hg-to-git"
.\hg-to-git-cli.cmd --help
.\hg-to-git-cli.cmd tools
```

Equivalent: `"C:\Program Files\hg-to-git\hg-to-git.exe" --cli status --hg-repo ... --git-repo ...`

### Developers (from source)

```powershell
git clone <repo-url> hg-to-git
cd hg-to-git

npm install
npm run install:web    # UI dependencies (web/node_modules)
npm run build          # compile TypeScript → dist/
```

**CLI on PATH** (once per machine):

```powershell
npm run link:cli
hg-to-git --help
```

Alternatives without global link:

```powershell
npx hg-to-git --help              # from repo root after build
.\hg-to-git.cmd --help            # Windows repo launcher
./hg-to-git --help                # macOS/Linux repo launcher
```

**Desktop dev** (hot reload):

```powershell
npm run electron:dev
```

**Try the test fixtures:**

```powershell
npm run test:hg:init
hg-to-git status --hg-repo fixtures/test-hg --git-repo fixtures/test-git
```

See [fixtures/README.md](fixtures/README.md) for fixture details.

---

## Preparing repositories

### Mercurial (source)

```powershell
hg clone https://example.com/myrepo D:\repos\myrepo-hg
# Largefiles: hg clone --all-largefiles …  or  hg lfpull --rev "all()"
```

### Git (target)

For a **first import**, the Git repo must be empty (no commits), or must already contain `.git/hg2git-*` state from a prior hg-to-git run.

```powershell
mkdir D:\repos\myrepo-git
cd D:\repos\myrepo-git
git init
git config core.ignoreCase false
```

Or let hg-to-git create `.git` on first use (`ensureGitTargetInitialized`).

### Project file (optional, desktop + CLI)

Save a `.hg-to-git-project.json` from the app (**File → Save**), or generate one:

```powershell
hg-to-git init-project --hg-repo D:\repos\myrepo-hg --git-repo D:\repos\myrepo-git --name "My Project"
```

---

## Your first conversion

### Desktop app

1. **File → New project** (or open a saved `.hg-to-git-project.json`).
2. Set **Mercurial** and **Git** paths. Click **Refresh**.
3. Fix any banners (`core.ignoreCase`, empty vs non-empty Git target).
4. Click **Run**. Watch the output panel for progress.
5. Enable **Check out master when conversion finishes** if you want the working tree updated.

### CLI

```powershell
# Pre-flight
hg-to-git validate --hg-repo D:\repos\myrepo-hg --git-repo D:\repos\myrepo-git

# Full import
hg-to-git convert `
  --hg-repo D:\repos\myrepo-hg `
  --git-repo D:\repos\myrepo-git `
  --no-sanitize `
  --checkout
```

Or with a project file:

```powershell
hg-to-git convert -p D:\projects\MyProject.hg-to-git-project.json
```

`git fast-import` updates `.git` only. Use `--checkout` (or enable checkout in the project) to refresh the working tree.

---

## Incremental sync and resume

After `hg pull` (or new commits in hg), run the **same conversion again** — only new Mercurial revisions are exported.

```powershell
hg-to-git convert -p MyProject.hg-to-git-project.json
# or
hg-to-git convert --git-repo D:\repos\myrepo-git   # when .hg-to-git.json exists
```

Check status first:

```powershell
hg-to-git status --hg-repo D:\repos\myrepo-hg --git-repo D:\repos\myrepo-git
```

### State files (in `.git/`)

| File | Purpose |
|------|---------|
| `hg2git-state` | Last imported tip, recorded hg repo path |
| `hg2git-marks` | Revision marks for git-fast-import |
| `hg2git-mapping` | hg node → git commit |
| `hg2git-heads` | Branch head checksums |

Back up these with the Git repo. To resume on another machine, copy the whole Git repo including `.git/hg2git-*`. If `hg2git-state` is missing but mapping/marks exist, hg-to-git can recover and resume.

### Start fresh

When the Git target has commits but **no** `hg2git-*` files (e.g. a manual `master` commit), you cannot safely increment — reset first:

```powershell
hg-to-git reset-target --hg-repo D:\repos\myrepo-hg --git-repo D:\repos\myrepo-git --force
hg-to-git convert --hg-repo D:\repos\myrepo-hg --git-repo D:\repos\myrepo-git --checkout
```

In the desktop app: **Reset Git target** on the red banner.

---

## Desktop app

Native **Electron** app with OS menus, modal folder pickers, and project files.

| Menu | Actions |
|------|---------|
| **File** | New project, Open Recent, Save / Save As, Load project file |
| **View** | Setup / Results, output panel, theme |
| **Run** | Start conversion |

Projects are stored in `%LOCALAPPDATA%\hg-to-git\projects.json`. Saved disk projects use `*.hg-to-git-project.json`.

**Setup** — repo paths, default branch, checkout option, branch delta view.  
**Results** — conversion output and status.  
**Output** — resizable log panel (hg-fast-export stream).

### Run modes

| Command | Purpose |
|---------|---------|
| `npm run electron:dev` | Dev: Vite + Electron + API server, hot reload |
| `npm run electron:run` | Production UI locally (same as packaged app behavior) |
| `npm run electron:pack` | Build Windows installer → `release/` |

### Browser vs desktop

| | Browser (`npm run dev:ui`) | Desktop (`electron:dev` / installer) |
|--|---------------------------|--------------------------------------|
| Folder browse | Helper process, not modal to browser | Native modal dialogs |
| Menus | In-window bar | OS-native menus |
| API | HTTP on port 3847 | IPC (no server) |

Prefer the **desktop app** for daily use. The browser mode is mainly for UI development.

---

## Headless CLI

Full cross-platform CLI with colored progress, `--json` for CI, `-q` / `-v` for quiet/verbose.

### Installing the command

| Method | When |
|--------|------|
| **`hg-to-git-cli.cmd`** (next to installed `.exe`) | Packaged app users |
| **`hg-to-git.exe --cli`** | Packaged app users |
| **`npm run link:cli`** | Developers — once after clone |
| **`npx hg-to-git`** | Repo root, no global install |
| **`.\hg-to-git.cmd`** / **`./hg-to-git`** | Repo launchers after `npm run build` |
| **`npm install -g .`** | Global install from source checkout |

Remove global link: `npm run unlink:cli`.

### Global flags

| Flag | Purpose |
|------|---------|
| `-h`, `--help` | Formatted help (also shown when no args) |
| `--json` | Machine-readable JSON on stdout |
| `-q`, `--quiet` | Errors and final result only |
| `-v`, `--verbose` | Branch deltas, pending changesets, full logs |
| `--no-color` | Plain text (`NO_COLOR` also respected) |

### Repo source (pick one)

1. **Project file:** `-p Project.hg-to-git-project.json`
2. **Direct paths:** `--hg-repo … --git-repo …`
3. **Config in Git repo:** `--git-repo …` when `.hg-to-git.json` exists there

CLI flags override file values.

### Commands

| Command | Description |
|---------|-------------|
| `convert` / `run` | Full or incremental import |
| `status` | Sync analysis, branch deltas, pending revisions |
| `validate` | Pre-flight: tools, repos, ignoreCase, git target |
| `reset-target` | Delete `.git`, re-init empty repo |
| `fix-ignore-case` | Set `core.ignoreCase false` |
| `tools` | Check git / hg / python / mercurial |
| `init-config` | Write `.hg-to-git.json` in the Git repo |
| `init-project` | Write `.hg-to-git-project.json` |

### Examples

```powershell
hg-to-git                                    # help
hg-to-git tools
hg-to-git status --hg-repo fixtures/test-hg --git-repo fixtures/test-git -v
hg-to-git validate -p MyProject.hg-to-git-project.json
hg-to-git convert --hg-repo D:\hg --git-repo D:\git --checkout --dry-run
hg-to-git --json status -p project.hg-to-git-project.json
```

During `convert`, a progress bar appears on stderr when attached to a terminal.

---

## Configuration

### `.hg-to-git.json` (in the Git repo)

Copy [`.hg-to-git.example.json`](.hg-to-git.example.json) or generate:

```powershell
hg-to-git init-config --git-repo D:\repos\myrepo-git --hg-repo D:\repos\myrepo-hg
```

```json
{
  "hgRepo": "D:/repos/myproject-hg",
  "gitRepo": "D:/repos/myproject-git",
  "defaultBranch": "master",
  "sanitizeNames": false,
  "hgTags": true,
  "repackAfterImport": true,
  "authorsMap": "authors.map",
  "checkoutWorkingTree": true
}
```

### `.hg-to-git-project.json` (desktop + CLI)

Saved from the app or via `hg-to-git init-project`. Contains `name`, `hgRepo`, `gitRepo`, `defaultBranch`, `checkoutWorkingTree`.

### fast-export location

Resolved in order:

1. `fastExportPath` in config / `--fast-export`
2. `vendor/fast-export` next to this repo (or inside the packaged app)
3. `%LOCALAPPDATA%\hg-to-git\fast-export` (auto-cloned on first run)

Override: env `HG_TO_GIT_FAST_EXPORT`.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `HG_TO_GIT_FAST_EXPORT` | Path to fast-export checkout |
| `HG_TO_GIT_CLI` | Set to `1` to force CLI mode in Electron entry |
| `NO_COLOR` | Disable CLI colors |
| `FORCE_COLOR` | Enable CLI colors when not a TTY |

---

## Branch, tag, and author mapping

Git and Mercurial allow different branch/tag names. Use mapping files (same line format as author map) and disable sanitization:

```powershell
hg-to-git convert `
  --hg-repo ... --git-repo ... `
  --branches-map branches.map `
  --tags-map tags.map `
  --no-sanitize
```

Branch/tag maps are auto-generated under `.hg-to-git/` when omitted (from hg branch/tag lists).

**Authors:** hg-to-git scans hg authors and writes `.hg-to-git/authors.map` with fallbacks for malformed identities (e.g. `<> <devnull@localhost>`). See [`authors.map.example`](authors.map.example).

If `default` and `master` both exist in Mercurial, set `--default-branch main` (or another name) to avoid a clash.

---

## Building a redistributable

### Prerequisites (build machine)

- Node.js 18+
- Windows (for `electron:pack` NSIS/portable targets as configured)
- Network access for `npm install` and first-time fast-export clone during tests

### Build steps

```powershell
npm install
npm run install:web
npm run build:app      # dist/ + web/dist/ (production UI)
npm run electron:pack  # Windows installer
```

Output: **`release/`**

| Artifact | Description |
|----------|-------------|
| `hg-to-git Setup x.x.x.exe` | NSIS installer |
| `hg-to-git x.x.x.exe` | Portable executable |
| `hg-to-git-cli.cmd` | Headless CLI launcher (installed beside the app) |

### What the installer includes

- Electron app with embedded Node
- Compiled backend (`dist/`)
- Production web UI (`web/dist/`)
- `hgFastExportLauncher.py` in `dist/`
- **Not included:** git, hg, python — end users install these separately

### Verify before shipping

```powershell
npm run electron:run     # smoke-test production UI locally
npm test                 # unit tests
npm run test:hg:init     # optional integration fixtures
```

### Publishing checklist

- [ ] Bump `version` in `package.json`
- [ ] `npm run build:app && npm run electron:pack`
- [ ] Test installer on a clean VM (tools missing → app guides install)
- [ ] Test `hg-to-git-cli.cmd status` and `convert` on sample repos
- [ ] Document required external tools for your users

---

## Development

### npm scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run build:web` | Build React UI |
| `npm run build:all` | Backend + web |
| `npm run build:app` | Backend + production web (for Electron) |
| `npm run dev:ui` | Browser dev: tsc watch + API + Vite |
| `npm run electron:dev` | Desktop dev: tsc watch + API + Vite + Electron |
| `npm run electron:run` | Desktop with built UI (no Vite) |
| `npm run electron:pack` | Windows installer |
| `npm run ui` | Serve built UI + API on port 3847 |
| `npm run link:cli` | Global `hg-to-git` command for dev |
| `npm test` | Vitest (backend + web) |

### Project layout

```
hg-to-git/
├── bin/              # npm bin entry (hg-to-git.js)
├── dist/             # compiled backend (generated)
├── packaging/        # installer extras (hg-to-git-cli.cmd)
├── src/              # TypeScript backend, Electron, CLI
├── web/              # React UI (Vite)
├── fixtures/         # test-hg / test-git sample repos
├── scripts/          # fixture seeding, legacy PowerShell helpers
└── release/          # electron-builder output (generated)
```

---

## Testing

### Unit tests (no hg/git required)

```powershell
npm test
npm run test:watch
npm run test:coverage
```

Backend: `src/**/*.test.ts` · Web: `web/src/**/*.test.ts`

### Integration fixtures

```powershell
npm run test:hg:init      # seed fixtures/test-hg + empty test-git
npm run test:hg:evolve    # add commits for incremental sync tests
```

```powershell
hg-to-git reset-target --hg-repo fixtures/test-hg --git-repo fixtures/test-git --force
hg-to-git convert --hg-repo fixtures/test-hg --git-repo fixtures/test-git --no-sanitize --checkout
hg-to-git status --hg-repo fixtures/test-hg --git-repo fixtures/test-git
```

Use `--force` with `test:hg:init` to recreate fixtures from scratch.

---

## Architecture

| Layer | Role |
|--------|------|
| `web/` | React UI (Vite, Tailwind, Radix) |
| `src/backend.ts` | Shared API: conversion, snapshot, projects |
| `src/conversionJob.ts` | Convert pipeline (authors, branches, fast-export) |
| `src/cliMain.ts` | Headless CLI (Commander) |
| `src/electron/entry.ts` | Electron entry: `--cli` → CLI, else → GUI |
| `src/electron/main.ts` | Window, IPC, native dialogs |
| `src/electron/preload.ts` | `window.hgToGit` bridge |
| Browser mode | `src/server/index.ts` — HTTP API on port 3847 |

Conversion engine: [frej/fast-export](https://github.com/frej/fast-export) via `hgFastExportLauncher.py`.

---

## Correctness and troubleshooting

| Issue | What to do |
|-------|------------|
| **Git target not empty** (red banner) | No `hg2git-*` state — use **Reset Git target** / `reset-target`, then full import. Do not use **Run with force** unless you understand the risk. |
| **`core.ignoreCase` true** (yellow banner) | **Fix automatically** or `hg-to-git fix-ignore-case`. Must be false before first import on Windows/macOS. |
| **Mercurial is ahead** | Normal — run convert again (incremental). |
| **Hg-only branches in delta** | Normal mid-migration until branches are exported. |
| **Interrupted import** | Re-run convert; hg-to-git recovers from `hg2git-*` and `*~` backups. |
| **Repo path mismatch** | Conversion state `:repo` differs from project — fix paths or reset. |
| **Unnamed heads** | Use `--ignore-unnamed-heads` (default), head2branch plugin, or hg-export-tool. |
| **Invalid author date** | Auto `authors.map` generation; add manual mappings if needed. |
| **History rewritten in hg** | Do not rewrite hg history that was already imported. Incremental sync assumes append-only hg. |
| **Working tree stale** | Enable checkout in project / `--checkout`, or `git checkout` manually after import. |

Legacy PowerShell helper: `scripts/Convert-HgToGit.ps1` (still supported for simple scripted runs).

---

## License

MIT. Conversion engine is [fast-export](https://github.com/frej/fast-export) (MIT/GPL components as noted upstream).
