export interface SnapshotOptions {
  /** Git name for Mercurial `default` (-M). Default: master. */
  defaultBranch?: string;
  /** Path to hg-fast-export branch map (-B). */
  branchesMap?: string;
}
