# Test fixtures

Create sample Mercurial and Git repos for manual testing:

```powershell
npm run test:hg:init
```

After a conversion, simulate new Hg work:

```powershell
npm run test:hg:evolve
```

Then in the app: **Refresh** (should show pending revisions / “Mercurial is ahead”), then **Run** again for an incremental import. See root `README.md` → “Incremental sync” and “Correctness notes”.

Paths are written to `fixtures/paths.json` and printed to the console. Paste them into **Setup → Repositories** in the app.

| Variable | Default |
|----------|---------|
| `HG_TO_GIT_TEST_HG` | `fixtures/test-hg` |
| `HG_TO_GIT_TEST_GIT` | `fixtures/test-git` |

Use `--force` with `test:hg:init` to recreate repos from scratch.

### Tags (Hg)

After `test:hg:init`, the fixture has Mercurial tags **`fixture-v0.1`**, **`alpha-v1`**, and **`fixture-v0.2`** on default / feature-alpha milestones. Each `test:hg:evolve` run adds **`evolve-YYYY-MM-DD`**, **`evolve-beta-v1`** on the new branch, and moves **`evolve-latest`** to default tip. Run a full **Sync** in the app to get matching Git tags, then expand a branch to see tag badges on commits.

The Git fixture is intentionally **empty** (no commits). If you previously ran an older seed that created a `master` commit, re-run `npm run test:hg:init -- --force` or use **Reset Git target** in the app.

The script finds `hg` the same way the app does (Python `Scripts\hg.exe`, `%LOCALAPPDATA%\hg-to-git\tool-paths.json`, etc.). If an empty `test-hg` folder exists without `.hg`, it is removed and re-seeded automatically.

Set `HG_TO_GIT_HG` to the full path to `hg.exe` if discovery still fails.
