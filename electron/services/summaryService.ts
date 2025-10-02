// imports 精简：通过 ports 注入所需依赖
import { extractDiffFeatures } from './diffFeatures';
import { scoreFromFeatures } from './progressScorer';
import { Storage } from './storage';
import { todayKey } from './dateUtil';
import { calcProgressPercentComplex } from './progressCalculator';
import { computeLocalProgress } from './progressEngine';
import { makeDefaultPorts } from './ports';

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
  const { git } = await makeDefaultPorts();
  const today = todayKey();
  const diff = await git.getUnifiedDiffSinceDate(today);
  return { date: today, diff };
}

export async function generateTodaySummary(opts?: { onProgress?: (done: number, total: number) => void }): Promise<SummaryResult> {
  const { db: pdb, git, cfg, summarizer } = await makeDefaultPorts();
  const today = todayKey();
  // Local scoring parameters
  const ls = (cfg as any).localScoring || {};
  const LS_COLD_N = (typeof ls.coldStartN === 'number') ? ls.coldStartN : 3;
  const LS_WIN_D = (typeof ls.windowDays === 'number') ? ls.windowDays : 30;
  const LS_ALPHA = (typeof ls.alpha === 'number') ? ls.alpha : 0.65;
  const LS_CAP_COLD = (typeof ls.capCold === 'number') ? ls.capCold : 98;
  const LS_CAP_STABLE = (typeof ls.capStable === 'number') ? ls.capStable : 85;
  const LS_W_LOW = (typeof ls.winsorPLow === 'number') ? ls.winsorPLow : 0.05;
  const LS_W_HIGH = (typeof ls.winsorPHigh === 'number') ? ls.winsorPHigh : 0.95;
  const LS_N_MEAN = (typeof ls.normalMean === 'number') ? ls.normalMean : 88;
  const LS_N_STD = (typeof ls.normalStd === 'number') ? ls.normalStd : 14;
  const LS_REG_CAP = (typeof ls.regressionCapAfterHigh === 'number') ? ls.regressionCapAfterHigh : 80;
  const LS_HIGH_TH = (typeof ls.highThreshold === 'number') ? ls.highThreshold : 95;

  // Build unified diff and semantic features first
  const diff = await git.getUnifiedDiffSinceDate(today);
  const feats = extractDiffFeatures(diff);
  const localScoreRaw = scoreFromFeatures(feats);
  try { if (process.env.ACHIEVO_DEBUG === 'score') console.debug('[Score] raw', { today, localScoreRaw, feats }); } catch {}
  // Build history window for ECDF (last 30 days, excluding today)
  const startDate = (() => { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - Math.max(7, LS_WIN_D)); return d.toISOString().slice(0,10); })();
  const historyRows = await pdb.getDaysRange(startDate, today);
  const samples: number[] = (historyRows || [])
    .filter(r => r.date !== today && typeof (r as any).localScoreRaw === 'number')
    .map(r => (r as any).localScoreRaw as number);
  // 后续将通过 progressEngine 统一完成 ECDF/冷启动/平滑/回归
  // 先准备昨日基线

  // Previous baseline (base + local)
  let prevBase = 0;
  let prevLocal = 0;
  let prevLocalRaw: number | null = null;
  try {
    const y = pdb.getYesterday(today);
    if (y) {
      const prev = await pdb.getDay(y);
      prevBase = prev?.baseScore || 0;
      prevLocal = typeof prev?.localScore === 'number' ? (prev.localScore as number) : 0;
      prevLocalRaw = (typeof (prev as any)?.localScoreRaw === 'number') ? ((prev as any).localScoreRaw as number) : null;
    }
  } catch {}

  // 统一调用引擎
  const engineOut = computeLocalProgress({
    rawLocal: localScoreRaw,
    historyRaw: samples,
    cfg: {
      coldStartN: LS_COLD_N,
      windowDays: LS_WIN_D,
      alpha: LS_ALPHA,
      capCold: LS_CAP_COLD,
      capStable: LS_CAP_STABLE,
      winsorPLow: LS_W_LOW,
      winsorPHigh: LS_W_HIGH,
      normalMean: LS_N_MEAN,
      normalStd: LS_N_STD,
      regressionCapAfterHigh: LS_REG_CAP,
      highThreshold: LS_HIGH_TH,
    },
    prevLocal,
    prevLocalRaw,
  });
  let localScore = engineOut.localScore;
  try { if (process.env.ACHIEVO_DEBUG === 'score') console.debug('[Score] engine', engineOut.debug); } catch {}

  // Numstat for counts & context
  const ns = await git.getNumstatSinceDate(today);

  // Prefer chunked summarization to avoid context overflow; fallback to single-shot
  let summaryRes: { text: string; model?: string; provider?: string; tokens?: number; durationMs?: number; chunksCount?: number };
  try {
    summaryRes = await summarizer.summarizeUnifiedDiffChunked(diff, {
      insertions: ns.insertions,
      deletions: ns.deletions,
      prevBaseScore: prevBase,
      localScore,
      features: feats,
      onProgress: (done, total) => opts?.onProgress?.(done, total),
    });
  } catch {
    summaryRes = await summarizer.summarizeUnifiedDiff(diff, { insertions: ns.insertions, deletions: ns.deletions, prevBaseScore: prevBase, localScore, features: feats });
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

  // Compute blended progress percent using trend, prevBase, local/localScore, aiScore, and total changes
  const hasChanges = (ns.insertions + ns.deletions) > 0 || (localScore > 0) || (feats.hunks > 0);
  // Persist counts first so today's trend/base are up-to-date
  try {
    await pdb.upsertDayAccumulate(today, ns.insertions, ns.deletions);
  } catch {}
  let progressPercent = 0;
  try {
    const todayRow = await pdb.getDay(today);
    const trend = Math.max(0, todayRow?.trend || 0);
    progressPercent = calcProgressPercentComplex({
      trend,
      prevBase,
      localScore,
      aiScore,
      totalChanges: Math.max(0, ns.insertions + ns.deletions),
      hasChanges,
      cap: 25,
    });
  } catch {}

  // Persist summary & aggregates & metrics & meta
  try {
    const existed = await pdb.getDay(today);
    if (!existed) await pdb.upsertDayAccumulate(today, 0, 0);
    if (markdown) await pdb.setDaySummary(today, markdown);
    await pdb.updateAggregatesForDate(today);
  } catch {}
  try {
    const lastGenAt = Date.now();
    await pdb.setDayMetrics(today, { aiScore, localScore, localScoreRaw, progressPercent }, { overwriteToday: true });
    const estTokens = (typeof summaryRes.tokens === 'number' && summaryRes.tokens > 0)
      ? summaryRes.tokens
      : Math.max(1, Math.round((markdown?.length || 0) / 4));
    await pdb.setDayAiMeta(today, {
      aiModel: summaryRes.model || undefined,
      aiProvider: summaryRes.provider || undefined,
      aiTokens: estTokens,
      aiDurationMs: typeof summaryRes.durationMs === 'number' ? summaryRes.durationMs : undefined,
      chunksCount: typeof summaryRes.chunksCount === 'number' ? summaryRes.chunksCount : undefined,
      lastGenAt,
    });
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
