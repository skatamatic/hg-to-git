import { prepareAuthorsMapForConvert } from "./authorsMap.js";
import { loadConfig, type HgToGitConfig } from "./config.js";
import { convertHgToGit } from "./fastExport.js";
import { parseOutputLine } from "./outputParser.js";
export type ConversionLogHandler = (data: Record<string, unknown>) => void;
import {
  assertGitRepo,
  assertHgRepo,
  checkIgnoreCase,
  detectVersions,
} from "./prerequisites.js";
import { checkGitTarget } from "./gitTarget.js";

export async function runConversionJob(
  body: Record<string, unknown>,
  onLog: ConversionLogHandler,
): Promise<{
  result: Awaited<ReturnType<typeof convertHgToGit>>;
}> {
  const gitRepo = String(body.gitRepo ?? "");
  const authorsMap = await prepareAuthorsMapForConvert({
    gitRepo,
    authorMappings: body.authorMappings as
      | import("./authorsMap.js").AuthorMappingEntry[]
      | undefined,
    authorsMap: body.authorsMap as string | undefined,
  });
  const config = await loadConfig(undefined, {
    ...body,
    ...(authorsMap ? { authorsMap } : {}),
  });
  checkIgnoreCase(config.gitRepo, config.force);
  checkGitTarget(config.gitRepo, config.force);
  assertHgRepo(config.hgRepo);
  assertGitRepo(config.gitRepo);
  detectVersions(config.gitRepo, config.hgRepo, config.python);

  const result = await convertHgToGit(config as HgToGitConfig, {
    onLine: (stream, line) => {
      if (!line.trim()) return;
      const parsed = parseOutputLine(line);
      onLog({ stream, ...parsed });
    },
  });

  return { result };
}
