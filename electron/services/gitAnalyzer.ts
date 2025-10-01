import simpleGit, { SimpleGit } from 'simple-git';

export type GitDiffNumstat = {
  insertions: number;
  deletions: number;
};

export class GitAnalyzer {
  private git: SimpleGit;
  constructor(private repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  // Get aggregated insertions/deletions since local date (YYYY-MM-DD), including working tree changes
  async getNumstatSinceDate(date: string): Promise<GitDiffNumstat> {
    const before = `${date}T00:00:00`;
    let base = (await this.git.raw(['rev-list', '--max-count=1', `--before=${before}`, 'HEAD'])).trim();
    if (!base) {
      base = (await this.git.raw(['rev-list', '--max-parents=0', 'HEAD'])).split('\n').filter(Boolean).pop() || '';
      if (!base) return { insertions: 0, deletions: 0 };
    }
    // Committed changes since base
    const committedNum = await this.git.raw(['diff', '--no-color', '-M', '-C', '--textconv', '--numstat', `${base}..HEAD`]);
    let ins = 0, del = 0;
    for (const line of committedNum.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const aStr = parts[0] ?? '-';
        const bStr = parts[1] ?? '-';
        const a = aStr === '-' ? 0 : parseInt(aStr, 10) || 0;
        const b = bStr === '-' ? 0 : parseInt(bStr, 10) || 0;
        ins += a; del += b;
      }
    }
    // Plus uncommitted working tree vs HEAD
    const workingNum = await this.git.raw(['diff', '--no-color', '-M', '-C', '--textconv', '--numstat', 'HEAD']);
    for (const line of workingNum.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const aStr = parts[0] ?? '-';
        const bStr = parts[1] ?? '-';
        const a = aStr === '-' ? 0 : parseInt(aStr, 10) || 0;
        const b = bStr === '-' ? 0 : parseInt(bStr, 10) || 0;
        ins += a; del += b;
      }
    }
    return { insertions: ins, deletions: del };
  }

  async getHeadCommit(): Promise<string> {
    const log = await this.git.log({ n: 1 });
    return log.latest?.hash || '';
    }

  // Get aggregated insertions/deletions between two commits (exclusive of from, inclusive of to)
  async getDiffNumstat(fromCommit: string | null, toCommit: string): Promise<GitDiffNumstat> {
    // If fromCommit is null, compare with first parent of toCommit
    let base = fromCommit;
    if (!base) {
      const parents = await this.git.raw(['rev-list', '--max-parents=1', toCommit]);
      base = parents.trim();
      if (!base) return { insertions: 0, deletions: 0 };
    }
    const out = await this.git.raw(['diff', '--numstat', `${base}..${toCommit}`]);
    // numstat lines: "<insert>\t<delete>\t<file>"
    let insertions = 0, deletions = 0;
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const aStr = parts[0] ?? '-';
        const bStr = parts[1] ?? '-';
        const ins = aStr === '-' ? 0 : parseInt(aStr, 10) || 0;
        const del = bStr === '-' ? 0 : parseInt(bStr, 10) || 0;
        insertions += ins;
        deletions += del;
      }
    }
    return { insertions, deletions };
  }

  // Working tree changes (not committed)
  async getWorkingTreeNumstat(): Promise<GitDiffNumstat> {
    const out = await this.git.raw(['diff', '--numstat']);
    let insertions = 0, deletions = 0;
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const aStr = parts[0] ?? '-';
        const bStr = parts[1] ?? '-';
        const ins = aStr === '-' ? 0 : parseInt(aStr, 10) || 0;
        const del = bStr === '-' ? 0 : parseInt(bStr, 10) || 0;
        insertions += ins;
        deletions += del;
      }
    }
    return { insertions, deletions };
  }

  // Get unified diff text since the last commit before the given local-date (YYYY-MM-DD)
  // This compares base commit vs current working tree so uncommitted changes are included.
  async getUnifiedDiffSinceDate(date: string): Promise<string> {
    // Use ISO-like format to avoid locale parsing issues on different platforms
    const before = `${date}T00:00:00`;
    let base = (await this.git.raw(['rev-list', '--max-count=1', `--before=${before}`, 'HEAD'])).trim();
    if (!base) {
      // fallback to first commit in repo
      base = (await this.git.raw(['rev-list', '--max-parents=0', 'HEAD'])).split('\n').filter(Boolean).pop() || '';
      if (!base) return '';
    }
    // Build robust diff: committed since base + uncommitted/staged
    // Add flags to ensure predictable output for UI parsing
    //  - --no-color: strip ANSI codes
    //  - -M -C: detect renames/copies
    //  - --textconv: show textconv for better readability (e.g., for LFS/textconv files)
    const committed = await this.git.raw(['diff', '--no-color', '-M', '-C', '--textconv', `${base}..HEAD`]);
    const uncommitted = await this.git.raw(['diff', '--no-color', '-M', '-C', '--textconv', 'HEAD']);
    // Avoid duplicating if any is empty; add a separator newline when both exist
    const parts = [committed.trim(), uncommitted.trim()].filter(p => p.length > 0);
    const combined = parts.join('\n');
    return combined;
  }
}
