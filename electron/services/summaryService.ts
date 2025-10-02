import { getConfig } from './config';
import { GitAnalyzer } from './gitAnalyzer';
import { extractDiffFeatures } from './diffFeatures';
import { scoreFromFeatures } from './progressScorer';
import { summarizeUnifiedDiff, summarizeUnifiedDiffChunked } from './aiSummarizer';
import { DB } from './db_sqljs';
import { db } from './dbInstance';
import { Storage } from './storage';
import { todayKey } from './dateUtil';
import { calcProgressPercentByPrevLocal } from './progressCalculator';

export type SummaryResult = {
  date: string;
  summary: string;
  scoreAi: number;
  scoreLocal: number;
  progressPercent: number;
  featuresSummary: string;
  model?: string;
  provider?: string;
  tokens?: number;
  durationMs?: number;
  chunksCount?: number;
  lastGenAt?: number;
};

const storage = new Storage();

export async function buildTodayUnifiedDiff(): Promise<{ date: string; diff: string }> {
  const cfg = await getConfig();
  const repo = cfg.repoPath;
  if (!repo) throw new Error('未设置仓库路径');
  const git = new GitAnalyzer(repo);
  const today = todayKey();
  const diff = await git.getUnifiedDiffSinceDate(today);
  return { date: today, diff };
}

export async function generateTodaySummary(opts?: { onProgress?: (done: number, total: number) => void }): Promise<SummaryResult> {
  const cfg = await getConfig();
  const repo = cfg.repoPath;
  if (!repo) throw new Error('未设置仓库路径');
  const git = new GitAnalyzer(repo);
  const today = todayKey();

  // Build unified diff and semantic features first
  const diff = await git.getUnifiedDiffSinceDate(today);
  const feats = extractDiffFeatures(diff);
  const localScore = scoreFromFeatures(feats);

  // Previous baseline (base + local)
  let prevBase = 0;
  let prevLocal = 0;
  try {
    const y = db.getYesterday(today);
    if (y) {
      const prev = await db.getDay(y);
      prevBase = prev?.baseScore || 0;
      prevLocal = typeof prev?.localScore === 'number' ? (prev.localScore as number) : 0;
    }
  } catch {}

  // Numstat for counts & context
  const ns = await git.getNumstatSinceDate(today);

  // Prefer chunked summarization to avoid context overflow; fallback to single-shot
  let summaryRes: { text: string; model?: string; provider?: string; tokens?: number; durationMs?: number; chunksCount?: number };
  try {
    summaryRes = await summarizeUnifiedDiffChunked(diff, {
      insertions: ns.insertions,
      deletions: ns.deletions,
      prevBaseScore: prevBase,
      localScore,
      features: feats,
      onProgress: (done, total) => opts?.onProgress?.(done, total),
    });
  } catch {
    summaryRes = await summarizeUnifiedDiff(diff, { insertions: ns.insertions, deletions: ns.deletions, prevBaseScore: prevBase, localScore, features: feats });
  }

  let aiScore = 0;
  let markdown = '';
  try {
    const obj = JSON.parse(summaryRes.text);
    aiScore = Math.max(0, Math.min(100, Number(obj?.score_ai ?? obj?.score) || 0));
    markdown = String(obj?.markdown || '');
  } catch {
    markdown = summaryRes.text || '';
  }

  // Compute progress percent vs yesterday localScore (Scheme B)
  const hasChanges = (ns.insertions + ns.deletions) > 0 || (localScore > 0) || (feats.hunks > 0);
  let progressPercent = calcProgressPercentByPrevLocal(localScore, prevLocal, { defaultDenom: 50, cap: 25, hasChanges });

  // Persist counts & summary & metrics & meta
  try {
    await db.setDayCounts(today, ns.insertions, ns.deletions);
  } catch {}
  try {
    const existed = await db.getDay(today);
    if (!existed) await db.upsertDayAccumulate(today, 0, 0);
    if (markdown) await db.setDaySummary(today, markdown);
    await db.updateAggregatesForDate(today);
  } catch {}
  try {
    const lastGenAt = Date.now();
    await db.setDayMetrics(today, { aiScore, localScore, progressPercent }, { overwriteToday: true });
    const estTokens = (typeof summaryRes.tokens === 'number' && summaryRes.tokens > 0)
      ? summaryRes.tokens
      : Math.max(1, Math.round((markdown?.length || 0) / 4));
    await db.setDayAiMeta(today, {
      aiModel: summaryRes.model || undefined,
      aiProvider: summaryRes.provider || undefined,
      aiTokens: estTokens,
      aiDurationMs: typeof summaryRes.durationMs === 'number' ? summaryRes.durationMs : undefined,
      chunksCount: typeof summaryRes.chunksCount === 'number' ? summaryRes.chunksCount : undefined,
      lastGenAt,
    });
    try {
      const after = await db.getDay(today);
      // Debug: verify meta persisted
      console.log('[SummaryService] persisted meta', {
        date: today,
        lastGenAt: after?.lastGenAt,
        aiTokens: after?.aiTokens,
        aiDurationMs: after?.aiDurationMs,
        chunksCount: after?.chunksCount,
        aiModel: after?.aiModel,
        aiProvider: after?.aiProvider,
      });
    } catch {}
    const record = { timestamp: Date.now(), score: aiScore, summary: markdown || '（无内容）' };
    await storage.append(record);
    // attach meta for return
    summaryRes = { ...summaryRes, tokens: estTokens, durationMs: summaryRes.durationMs, model: summaryRes.model, provider: summaryRes.provider, chunksCount: summaryRes.chunksCount };
    // return payload includes lastGenAt below
    return {
      date: today,
      summary: markdown,
      scoreAi: aiScore,
      scoreLocal: localScore,
      progressPercent,
      featuresSummary: `代码文件:${feats.codeFiles} 测试:${feats.testFiles} 文档:${feats.docFiles} 配置:${feats.configFiles} Hunk:${feats.hunks} 重命名:${feats.renameOrMove} 语言:${Object.keys(feats.languages||{}).join('+')||'-'} 依赖变更:${feats.dependencyChanges?'是':'否'} 安全敏感:${feats.hasSecuritySensitive?'是':'否'}`,
      model: summaryRes.model,
      provider: summaryRes.provider,
      tokens: summaryRes.tokens,
      durationMs: summaryRes.durationMs,
      chunksCount: summaryRes.chunksCount,
      lastGenAt,
    };
  } catch {}

  const featuresSummary = `代码文件:${feats.codeFiles} 测试:${feats.testFiles} 文档:${feats.docFiles} 配置:${feats.configFiles} Hunk:${feats.hunks} 重命名:${feats.renameOrMove} 语言:${Object.keys(feats.languages||{}).join('+')||'-'} 依赖变更:${feats.dependencyChanges?'是':'否'} 安全敏感:${feats.hasSecuritySensitive?'是':'否'}`;
  // Fallback return in case meta block above throws but persistence succeeded
  return {
    date: today,
    summary: markdown,
    scoreAi: aiScore,
    scoreLocal: localScore,
    progressPercent,
    featuresSummary,
    model: summaryRes.model,
    tokens: summaryRes.tokens,
    durationMs: summaryRes.durationMs,
    chunksCount: summaryRes.chunksCount,
    lastGenAt: Date.now(),
  };
}
