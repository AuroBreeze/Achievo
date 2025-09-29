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
        const ins = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
        const del = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
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
        const ins = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
        const del = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
        insertions += ins;
        deletions += del;
      }
    }
    return { insertions, deletions };
  }

  // Get unified diff text since the last commit before the given ISO date (YYYY-MM-DD)
  async getUnifiedDiffSinceDate(date: string): Promise<string> {
    // Find last commit before the start of the day
    const before = `${date} 00:00`;
    const base = (await this.git.raw(['rev-list', '--max-count=1', `--before=${before}`, 'HEAD'])).trim();
    if (!base) {
      // No base before the day; return diff from first commit to HEAD as best effort
      return this.git.raw(['show', 'HEAD']);
    }
    const out = await this.git.raw(['diff', `${base}..HEAD`]);
    return out;
  }
}
