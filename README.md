# hg-to-git

Convert Mercurial repositories to Git with **full history fidelity** (commits, messages, branches, tags) and **incremental sync** when Mercurial moves forward.

This tool orchestrates [frej/fast-export](https://github.com/frej/fast-export) (`hg-fast-export.py` + `git fast-import`), which is the standard approach for production hg→git migrations. Incremental state lives in the Git repo under `.git/hg2git-*` — the same mechanism fast-export uses natively.

## Requirements

| Tool | Notes |
|------|--------|
| **Git** | 2.x+, on `PATH` |
| **Mercurial** | `hg` on `PATH` (local clone only; remote URLs must be cloned first) |
| **Python** | 3.7+ with `pip install mercurial` |
| **git** | Used to clone fast-export on first run if not vendored |

On Windows, use **Git for Windows** and install Mercurial (e.g. `choco install mercurial` or [TortoiseHg](https://tortoisehg.bitbucket.io/)).

## Quick start

### 1. Prepare repositories

```powershell
# Mercurial (must be a local clone)
hg clone https://example.com/myrepo D:\repos\myrepo-hg

# Empty Git repo
mkdir D:\repos\myrepo-git
cd D:\repos\myrepo-git
git init
git config core.ignoreCase false   # important on Windows
```

### 2. Initial conversion

**PowerShell:**

```powershell
.\scripts\Convert-HgToGit.ps1 `
  -HgRepo D:\repos\myrepo-hg `
  -GitRepo D:\repos\myrepo-git `
  -AuthorsMap D:\repos\authors.map `
  -NoSanitize `
  -Checkout master
```

**Node.js:**

```powershell
npm install
npm run build
node dist/cli.js convert `
  --hg-repo D:\repos\myrepo-hg `
  --git-repo D:\repos\myrepo-git `
  --authors-map D:\repos\authors.map `
  --no-sanitize `
  --checkout master
```

### 3. Incremental sync

After `hg pull` brings new commits into the Mercurial clone, run the **same command** again (or only `-GitRepo` if you use `.hg-to-git.json`):

```powershell
.\scripts\Convert-HgToGit.ps1 -GitRepo D:\repos\myrepo-git
```

Only new Mercurial revisions are exported. Run `git gc` periodically on large repos if you sync often (each import creates a new pack).

## Configuration file

Copy `.hg-to-git.example.json` to your Git repo as `.hg-to-git.json`:

```json
{
  "hgRepo": "D:/repos/myproject-hg",
  "gitRepo": "D:/repos/myproject-git",
  "defaultBranch": "master",
  "sanitizeNames": false,
  "authorsMap": "authors.map",
  "checkoutBranch": "master"
}
```

Generate a starter config:

```powershell
node dist/cli.js init-config --git-repo D:\repos\myrepo-git --hg-repo D:\repos\myrepo-hg
```

## Branch and tag mapping

Git and Mercurial allow different branch/tag names. Use mapping files (same format as author map) and disable sanitization:

```powershell
.\scripts\Convert-HgToGit.ps1 `
  -HgRepo ... -GitRepo ... `
  -BranchesMap branches.map `
  -TagsMap tags.map `
  -NoSanitize
```

If `default` and `master` both exist in Mercurial, set `-DefaultBranch main` (or another name) to avoid a clash.

## Author mapping

Create `authors.map` (see `authors.map.example`). Malformed hg author strings are normalized for Git.

## Correctness notes

- **Incremental imports** rely on Mercurial’s append-only changeset model. Do not rewrite hg history that was already imported.
- **Unnamed heads**: repos with extra heads per branch need `--ignore-unnamed-heads`, the [head2branch plugin](https://github.com/frej/fast-export/tree/master/plugins/head2branch), or [hg-export-tool](https://github.com/chrisjbillington/hg-export-tool) for duplicate heads.
- **Largefiles**: pull all largefiles in hg before export (`hg clone --all-largefiles` or `hg lfpull --rev "all()"`). See fast-export’s LFS plugin for Git LFS.
- **Working tree**: `git fast-import` does not check out files; use `-Checkout` / `--checkout` or `git checkout` after import.
- **case-insensitive filesystems**: set `core.ignoreCase false` before the first import.

## fast-export location

Resolved in order:

1. `fastExportPath` in config / `--fast-export`
2. `vendor/fast-export` next to this repo
3. `%LOCALAPPDATA%\hg-to-git\fast-export` (auto-cloned)

Override with env `HG_TO_GIT_FAST_EXPORT`.

## State files (incremental)

Stored in the Git repository’s `.git` directory:

| File | Purpose |
|------|---------|
| `hg2git-state` | Last imported tip, hg repo path |
| `hg2git-marks` | Revision marks for git-fast-import |
| `hg2git-mapping` | hg node → git commit |
| `hg2git-heads` | Branch head checksums for validation |

Back up these files with the Git repo when doing long conversions. To resume on another machine, copy the whole Git repo including `.git/hg2git-*`.

## Desktop app (Electron)

The same UI runs as a **desktop app** with native menus, folder pickers, and no separate API server.

- **File** — New project, Open Recent, Save
- **View** — Setup / Results, toggle Output panel, theme
- **Run** — Start conversion

Projects are stored in `%LOCALAPPDATA%\hg-to-git\projects.json` (migrated from older `ui-settings.json` on first launch).

```powershell
npm install
npm run electron:dev
```

This starts Vite + Electron. Browse buttons open **native modal** folder/file dialogs attached to the app window (recommended for daily use).

**Run Electron with the production UI** (no Vite, no API server — same as the packaged app):

```powershell
npm run electron:run
```

Rebuilds `dist/` and `web/dist/`, then launches `electron .` with IPC and `web/dist/index.html`. Use this to verify the native build before `electron:pack`.

**Package a Windows installer:**

```powershell
npm run electron:pack
```

Output goes to `release/`. The app still requires **git**, **hg**, and **Python + mercurial** on the machine — Electron wraps the UI and conversion orchestration, not those tools.

Architecture for learning:

| Layer | Role |
|--------|------|
| `web/` | React UI (Vite) |
| `src/backend.ts` | Shared conversion/settings logic |
| `src/electron/main.ts` | Window + IPC + native dialogs |
| `src/electron/preload.ts` | Safe bridge (`window.hgToGit`) |
| Browser mode | `npm run dev:ui` — HTTP API on port 3847 (see limits below) |

### Browser vs desktop

| | `npm run dev:ui` (browser tab) | `npm run electron:dev` / `electron:run` / packaged `.exe` |
|--|-------------------------------|------------------------------------------|
| Folder browse | Spawns a separate helper process; not modal to the browser tab | Native dialog, modal to the app window |
| Menus | In-window menu bar | OS-native menu (File / View / Run) |
| API server | Required on port 3847 | Not required (IPC) |

Browsers cannot host true OS file dialogs on the page. For hg-to-git, **use the desktop app** when you care about picker UX. Typing paths manually works in all modes.

## Web UI

A local **React** app (Tailwind CSS v4, Radix UI, Lucide icons) with a VS Code–style layout:

- **Setup** — project name, repo paths, author map, branch options
- **Results** — stats, conversion status, branch map
- **Output** — resizable bottom panel for hg-fast-export logs

In the browser, use the in-window menu bar; in Electron, menus are native (Windows menu bar / macOS app menu).

```powershell
npm install
npm run install:web   # UI dependencies (web/node_modules)
npm run build:all
npm run ui
# Open http://localhost:3847 — browse is limited; prefer electron:dev for pickers
```

For development, prefer **`npm run electron:dev`** over opening the Vite URL in an external browser.

### Unit tests

Pure logic (sync analysis, branch alignment, log parsing, author maps, config, UI helpers) is covered by **Vitest**:

```powershell
npm test              # run backend + web unit tests
npm run test:watch    # watch mode
npm run test:coverage # coverage report (backend + web)
```

Backend tests live under `src/**/*.test.ts`; web tests under `web/src/**/*.test.ts`. No Mercurial/Git binaries are required for the default suite.

### Test repositories

```powershell
npm run test:hg:init      # fixtures/test-hg (~8 commits, 2 branches) + empty test-git
npm run test:hg:evolve    # add commits + a new branch for incremental sync tests
```

See [fixtures/README.md](fixtures/README.md). Opening a project with those paths shows sync status, pending revisions, and branch deltas in Setup.

**Development** (hot reload for frontend):

```powershell
npm install
npm run install:web
npm run dev:ui
# UI: http://localhost:5173  (API proxied to :3847)
```

If Vite reports a missing package, run `npm install` inside the `web/` folder.

Settings persist in `%LOCALAPPDATA%\hg-to-git\ui-settings.json` and browser `localStorage`.

## License

MIT. Conversion engine is [fast-export](https://github.com/frej/fast-export) (MIT/GPL components as noted upstream).
