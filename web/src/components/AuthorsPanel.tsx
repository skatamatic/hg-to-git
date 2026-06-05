import { FileUp, ScanSearch, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AuthorMappingEntry, Project } from "../types";
import { fetchHgAuthors, importAuthorsMap, pickPath } from "../api";
import {
  gitIdentityFromEntry,
  isAuthorMappingComplete,
} from "../lib/authorFormat";
import { useInputsLocked } from "../lib/inputsLocked";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface Props {
  project: Project;
  onUpdate: (partial: Partial<Project>) => void;
  className?: string;
}

function mergeScan(
  existing: AuthorMappingEntry[],
  scanned: {
    hgAuthor: string;
    suggestedName?: string;
    suggestedEmail?: string;
  }[],
): AuthorMappingEntry[] {
  const byHg = new Map(existing.map((e) => [e.hgAuthor, { ...e }]));
  for (const row of scanned) {
    if (byHg.has(row.hgAuthor)) continue;
    byHg.set(row.hgAuthor, {
      hgAuthor: row.hgAuthor,
      gitName: row.suggestedName,
      gitEmail: row.suggestedEmail,
    });
  }
  return [...byHg.values()].sort((a, b) =>
    a.hgAuthor.localeCompare(b.hgAuthor),
  );
}

function mergeImport(
  existing: AuthorMappingEntry[],
  imported: AuthorMappingEntry[],
): AuthorMappingEntry[] {
  const byHg = new Map(existing.map((e) => [e.hgAuthor, { ...e }]));
  for (const row of imported) {
    const prev = byHg.get(row.hgAuthor);
    byHg.set(row.hgAuthor, { ...prev, ...row, hgAuthor: row.hgAuthor });
  }
  return [...byHg.values()].sort((a, b) =>
    a.hgAuthor.localeCompare(b.hgAuthor),
  );
}

export function AuthorsPanel({ project, onUpdate, className }: Props) {
  const inputsLocked = useInputsLocked();
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const mappings = project.authorMappings ?? [];

  useEffect(() => {
    const file = project.authorsMap?.trim();
    if (!file || mappings.length > 0) return;
    let cancelled = false;
    importAuthorsMap(file)
      .then((imported) => {
        if (!cancelled && imported.length > 0) {
          onUpdate({ authorMappings: imported });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project.authorsMap, mappings.length, onUpdate]);

  const updateRow = useCallback(
    (index: number, patch: Partial<AuthorMappingEntry>) => {
      const next = mappings.map((row, i) =>
        i === index ? { ...row, ...patch, gitIdentity: undefined } : row,
      );
      onUpdate({ authorMappings: next });
    },
    [mappings, onUpdate],
  );

  const handleScan = useCallback(async () => {
    if (!project.hgRepo?.trim()) {
      setActionError("Set the Mercurial repository path first.");
      return;
    }
    setScanning(true);
    setActionError(null);
    try {
      const rows = await fetchHgAuthors(project.hgRepo);
      if (rows.length === 0) {
        setActionError(
          "No commit authors found in this repository's history.",
        );
        return;
      }
      const merged = mergeScan(mappings, rows);
      onUpdate({ authorMappings: merged });
      setActionError(null);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setScanning(false);
    }
  }, [project.hgRepo, mappings, onUpdate]);

  const handleImport = useCallback(async () => {
    const picked = await pickPath({
      kind: "file",
      title: "Import authors.map",
      defaultPath: project.authorsMap ?? project.gitRepo,
    });
    if (picked.cancelled || !picked.path) return;
    setImporting(true);
    setActionError(null);
    try {
      const imported = await importAuthorsMap(picked.path);
      onUpdate({
        authorMappings: mergeImport(mappings, imported),
        authorsMap: picked.path,
      });
    } catch (e) {
      setActionError(String(e));
    } finally {
      setImporting(false);
    }
  }, [mappings, onUpdate, project.authorsMap, project.gitRepo]);

  const handleClear = () => {
    onUpdate({ authorMappings: [], authorsMap: undefined });
    setActionError(null);
  };

  return (
    <section
      className={cn(
        "surface-panel flex min-h-0 flex-col overflow-hidden",
        className,
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <Users className="size-3.5 text-muted-foreground" />
        <h3 className="text-ui-label">Authors</h3>
        {mappings.length > 0 && (
          <span className="text-ui-caption tabular-nums">
            {mappings.length} author{mappings.length === 1 ? "" : "s"}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2"
            disabled={inputsLocked || scanning || !project.hgRepo?.trim()}
            onClick={() => void handleScan()}
          >
            <ScanSearch
              className={cn("size-3", scanning && "animate-pulse")}
            />
            Scan Hg
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2"
            disabled={inputsLocked || importing}
            onClick={() => void handleImport()}
          >
            <FileUp className={cn("size-3", importing && "animate-pulse")} />
            Import
          </Button>
          {mappings.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-muted-foreground"
              disabled={inputsLocked}
              onClick={handleClear}
            >
              Clear
            </Button>
          )}
        </div>
      </header>

      <div className="shrink-0 border-b border-border/40 px-3 py-2">
        <p className="text-ui-caption">
          Map each Mercurial commit author to a Git identity. Saved in the
          project and written to{" "}
          <span className="text-ui-mono text-foreground/80">
            .hg-to-git/authors.map
          </span>{" "}
          when you run a conversion.
        </p>
        {actionError && (
          <p className="mt-1.5 text-ui-caption text-destructive">{actionError}</p>
        )}
      </div>

      {mappings.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <p className="text-ui-caption">No author mappings yet.</p>
          <p className="max-w-xs text-ui-caption text-muted-foreground/80">
            Scan your Hg repo to list commit authors, or import an existing
            authors.map file.
          </p>
        </div>
      ) : (
        <div className="scrollbar-themed min-h-0 flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-ui-caption">
            <thead className="sticky top-0 z-10 bg-elevated text-left">
              <tr className="border-b border-border/50">
                <th className="px-2 py-1.5 text-ui-label">Hg author</th>
                <th className="w-[28%] px-2 py-1.5 text-ui-label">Git name</th>
                <th className="w-[32%] px-2 py-1.5 text-ui-label">Git email</th>
                <th className="px-2 py-1.5 text-ui-label">Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {mappings.map((row, index) => {
                const complete = isAuthorMappingComplete(row);
                const preview = gitIdentityFromEntry(row);
                return (
                  <tr key={row.hgAuthor}>
                    <td className="max-w-[140px] px-2 py-1 align-middle">
                      <span
                        className="block truncate text-ui-mono leading-7 text-hg"
                        title={row.hgAuthor}
                      >
                        {row.hgAuthor}
                      </span>
                    </td>
                    <td className="px-1 py-1 align-middle">
                      <Input
                        value={row.gitName ?? ""}
                        readOnly={inputsLocked}
                        onChange={(e) =>
                          updateRow(index, { gitName: e.target.value })
                        }
                        placeholder="Name"
                        className={cn("h-7", inputsLocked && "opacity-80")}
                      />
                    </td>
                    <td className="px-1 py-1 align-middle">
                      <Input
                        value={row.gitEmail ?? ""}
                        readOnly={inputsLocked}
                        onChange={(e) =>
                          updateRow(index, { gitEmail: e.target.value })
                        }
                        placeholder="email@example.com"
                        className={cn("h-7", inputsLocked && "opacity-80")}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <span
                        className={cn(
                          "block truncate text-ui-mono leading-7",
                          complete ? "text-git" : "text-muted-foreground/60",
                        )}
                        title={preview ?? "Incomplete"}
                      >
                        {preview ?? "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
