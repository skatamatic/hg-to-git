export const PROJECT_FILE_SUFFIX = ".hg-to-git-project.json";

export function defaultProjectFileName(name: string): string {
  const base =
    name
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "project";
  return `${base}${PROJECT_FILE_SUFFIX}`;
}
