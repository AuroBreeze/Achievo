import { getConfig } from './config';
import type { DiffFeatures } from './diffFeatures';
import OpenAI from 'openai';
import type { DiffStat } from './codeAnalyzer';

export async function summarizeWithAI(diff: DiffStat, score: number): Promise<string> {
  const cfg = await getConfig();
  const provider = cfg.aiProvider || 'openai';
  const model = cfg.aiModel || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');
  const baseURL = cfg.aiBaseUrl || (provider === 'deepseek' ? 'https://api.deepseek.com' : undefined);
  const apiKey = cfg.aiApiKey || cfg.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('缺少 AI API Key');

  const client = new OpenAI({ apiKey, baseURL });
  const content = `请用中文简要总结以下代码改动对质量和进步的影响：\n` +
    `新增行: ${diff.added}, 删除行: ${diff.removed}, 修改行: ${diff.changed}.\n` +
    `计算得到的进步分数: ${score}/100.`;
  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: '你是资深代码审阅助手，擅长给出简明扼要的总结与建议。' },
      { role: 'user', content }
    ],
    temperature: 0.3,
  });

  const text = resp.choices?.[0]?.message?.content?.trim();
  return text || '（无内容）';
}

// Greedy but balanced extraction of the first JSON object in a text
function extractFirstJsonObject(s: string): string | null {
  const i = s.indexOf('{');
  if (i < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (inStr) {
      if (!esc && ch === '"') inStr = false;
      esc = (!esc && ch === '\\');
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(i, j + 1);
    }
  }
  return null;
}

export async function summarizeUnifiedDiff(
  diffText: string,
  ctx?: { insertions?: number; deletions?: number; prevBaseScore?: number; localScore?: number; features?: DiffFeatures }
): Promise<{ text: string; model?: string; provider?: string; tokens?: number; durationMs?: number; chunksCount?: number }> {
  // Quick local heuristic: only short-circuit when truly empty
  try {
    const trimmed = diffText.trim();
    if (!trimmed) return { text: JSON.stringify({ score: 0, markdown: '今日无代码改动' }), model: undefined, provider: undefined, tokens: 0, durationMs: 0, chunksCount: 0 };
    // If there is at least a diff header, proceed to AI summary regardless of +/- counts
    if (!trimmed.includes('diff --git')) {
      // Fallback check for any +/- lines excluding headers
      const lines = trimmed.split(/\r?\n/);
      let signal = false;
      for (const l of lines) {
        if (l.startsWith('+++') || l.startsWith('---') || l.startsWith('@@')) continue;
        if (l.startsWith('+') || l.startsWith('-')) { signal = true; break; }
      }
      if (!signal) return { text: JSON.stringify({ score: 0, markdown: '今日无代码改动' }), model: undefined, provider: undefined, tokens: 0, durationMs: 0, chunksCount: 0 };
    }
  } catch {}

  const cfg = await getConfig();
  const provider = cfg.aiProvider || 'openai';
  const model = cfg.aiModel || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');
  const baseURL = cfg.aiBaseUrl || (provider === 'deepseek' ? 'https://api.deepseek.com' : undefined);
  const apiKey = cfg.aiApiKey || cfg.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('缺少 AI API Key');

  const client = new OpenAI({ apiKey, baseURL });
  const system = '你是资深代码审阅助手。请只输出严格的 JSON，不要任何额外文本，不要使用```代码块包裹，不要输出除JSON外的说明。JSON 格式如下：\n' +
    '{"score_ai": 0-100 的整数, "markdown": 用于展示的 Markdown 文本}。';
  // 限长，避免超出上限
  const snippet = diffText.slice(0, 60000);
  // 附加显式提醒，减少“误判为无改动”的概率
  const f = ctx?.features;
  const featuresCompact = f ? `\n特征摘要：filesTotal=${f.filesTotal}, codeFiles=${f.codeFiles}, testFiles=${f.testFiles}, docFiles=${f.docFiles}, configFiles=${f.configFiles}, hunks=${f.hunks}, renames=${f.renameOrMove}, langs=${Object.keys(f.languages||{}).join('+')}, depChanges=${f.dependencyChanges}, securitySensitive=${f.hasSecuritySensitive}` : '';
  const metrics = `提供的参考指标：新增行=${ctx?.insertions ?? '未知'}，删除行=${ctx?.deletions ?? '未知'}，本地分数(localScore)=${ctx?.localScore ?? '未知'}，昨日基准(prevBase)=${ctx?.prevBaseScore ?? '未知'}。${featuresCompact}`;
  const user = `基于以下统一 diff，生成一个 JSON：\n` +
    `- score_ai: 0-100 的整数，综合考虑质量、复杂度、影响面、可维护性、安全性、性能。\n` +
    `- markdown: 中文 Markdown 段落，包含：关键变更点（按文件）、价值/风险、后续建议，可用列表/小标题。\n` +
    `${metrics}\n` +
    `要求：只输出 JSON，不要额外解释；若确有改动请不要写“无改动”。\n` +
    `---\n` +
    snippet;

  const started = Date.now();
  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
  });
  const durationMs = Date.now() - started;
  const text2 = resp.choices?.[0]?.message?.content?.trim() || '（无内容）';
  const tokens = (resp as any)?.usage?.total_tokens ?? undefined;
  return { text: text2, model: (resp as any)?.model || model, provider, tokens, durationMs, chunksCount: 1 };
}

// Split unified diff by file sections (diff --git ...) into size-bounded chunks
function splitUnifiedDiffIntoChunks(diffText: string, maxChars = 48000): string[] {
  const parts = diffText.split(/\n(?=diff --git )/g); // keep the first line if not starting with diff
  const chunks: string[] = [];
  let current = '';
  for (let i = 0; i < parts.length; i++) {
    const first = parts[0] ?? '';
    const pi = parts[i] ?? '';
    const seg = (i === 0 && !first.startsWith('diff --git ')) ? first : ('\n' + pi);
    if ((current + seg).length > maxChars && current) {
      chunks.push(current);
      current = seg;
    } else {
      current += seg;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(c => c.trim());
}

// Try to parse model output that may include code fences or non-strict JSON
function tryParseSummaryJson(text: string): { score_ai: number; markdown: string } | null {
  if (!text) return null;
  let t = text.trim();
  // strip code fences ```json ... ``` or ``` ... ``` (support \r\n)
  const fence = /^```[a-zA-Z0-9]*\r?\n([\s\S]*?)\r?\n```$/m;
  const fm = t.match(fence);
  if (fm && fm[1]) t = fm[1].trim();
  // try direct JSON first
  try {
    const obj = JSON.parse(t);
    const sc = Math.max(0, Math.min(100, Number(obj?.score_ai ?? obj?.score) || 0));
    const md = String(obj?.markdown ?? obj?.summary ?? obj?.text ?? '');
    return { score_ai: sc, markdown: md };
  } catch {}
  // fallback: extract the first {...} block and parse
  const balanced = extractFirstJsonObject(t);
  if (balanced) {
    try {
      const obj = JSON.parse(balanced);
      const sc = Math.max(0, Math.min(100, Number(obj?.score_ai ?? obj?.score) || 0));
      const md = String(obj?.markdown ?? obj?.summary ?? obj?.text ?? '');
      return { score_ai: sc, markdown: md };
    } catch {}
  }
  // last resort: regex to capture "markdown":"..."
  const m1 = t.match(/"markdown"\s*:\s*"([\s\S]*?)"\s*(,|\})/);
  if (m1 && typeof m1[1] === 'string') {
    const md = m1[1].replace(/\\n/g,'\n').replace(/\\"/g,'"');
    return { score_ai: 0, markdown: md };
  }
  return null;
}

// Replace any fenced JSON blocks that contain a {"markdown": "..."} with the inner markdown content
function replaceJsonFencesWithMarkdown(md: string): string {
  if (!md) return md;
  let out = md;
  // global, multiline: block fences ```lang\n...\n```
  const blockFenceRe = /```[a-zA-Z0-9]*\r?\n([\s\S]*?)\r?\n```/g;
  out = out.replace(blockFenceRe, (_m, inner) => {
    const parsed = tryParseSummaryJson(String(inner));
    if (parsed?.markdown && parsed.markdown.trim()) return parsed.markdown.trim();
    return _m;
  });
  // inline fences: ```lang { ... } ``` (same line)
  const inlineFenceRe = /```[a-zA-Z0-9]*\s*(\{[\s\S]*?\})\s*```/g;
  out = out.replace(inlineFenceRe, (_m, inner) => {
    const parsed = tryParseSummaryJson(String(inner));
    if (parsed?.markdown && parsed.markdown.trim()) return parsed.markdown.trim();
    return _m;
  });
  return out;
}

// Chunked summarization to avoid context overflow; returns JSON string like {"score_ai": number, "markdown": string}
export async function summarizeUnifiedDiffChunked(
  diffText: string,
  ctx?: { insertions?: number; deletions?: number; prevBaseScore?: number; localScore?: number; features?: DiffFeatures; onProgress?: (done: number, total: number) => void }
): Promise<{ text: string; model?: string; provider?: string; tokens?: number; durationMs?: number; chunksCount?: number }> {
  const trimmed = (diffText || '').trim();
  if (!trimmed) return { text: JSON.stringify({ score_ai: 0, markdown: '今日无代码改动' }), model: undefined, provider: undefined, tokens: 0, durationMs: 0, chunksCount: 0 };

  // If small enough, reuse single-shot path
  if (trimmed.length <= 60000) {
    try { return await summarizeUnifiedDiff(diffText, ctx); } catch {}
  }

  const cfg = await getConfig();
  const provider = cfg.aiProvider || 'openai';
  const model = cfg.aiModel || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');
  const baseURL = cfg.aiBaseUrl || (provider === 'deepseek' ? 'https://api.deepseek.com' : undefined);
  const apiKey = cfg.aiApiKey || cfg.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('缺少 AI API Key');

  const client = new OpenAI({ apiKey, baseURL });
  const chunks = splitUnifiedDiffIntoChunks(trimmed, 48000);

  const system = '你是资深代码审阅助手。请只输出严格的 JSON，不要任何额外文本。JSON 格式如下：\n' +
    '{"score_ai": 0-100 的整数, "markdown": 用于展示的 Markdown 文本}。';
  const f = ctx?.features;
  const featuresCompact = f ? `\n特征摘要：filesTotal=${f.filesTotal}, codeFiles=${f.codeFiles}, testFiles=${f.testFiles}, docFiles=${f.docFiles}, configFiles=${f.configFiles}, hunks=${f.hunks}, renames=${f.renameOrMove}, langs=${Object.keys(f.languages||{}).join('+')}, depChanges=${f.dependencyChanges}, securitySensitive=${f.hasSecuritySensitive}` : '';
  const metrics = `提供的参考指标：新增行=${ctx?.insertions ?? '未知'}，删除行=${ctx?.deletions ?? '未知'}，本地分数(localScore)=${ctx?.localScore ?? '未知'}，昨日基准(prevBase)=${ctx?.prevBaseScore ?? '未知'}。${featuresCompact}`;

  const partials: { score_ai: number; markdown: string }[] = [];
  let totalTokens = 0;
  const t0 = Date.now();
  for (let idx = 0; idx < chunks.length; idx++) {
    const ci = chunks[idx] ?? '';
    const part = ci.slice(0, 45000); // extra safety margin
    const user = `这是第 ${idx+1}/${chunks.length} 个分片的统一 diff，请针对该分片生成 JSON：\n` +
      `- score_ai: 0-100 的整数\n` +
      `- markdown: 中文 Markdown，聚焦该分片的关键变更点/价值与风险/后续建议\n` +
      `${metrics}\n---\n${part}`;
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
    });
    const txt = resp.choices?.[0]?.message?.content?.trim() || '';
    const tk = (resp as any)?.usage?.total_tokens ?? 0; totalTokens += (typeof tk === 'number' ? tk : 0);
    const parsed = tryParseSummaryJson(txt);
    if (parsed) partials.push(parsed);
    else {
      // if still not parseable, treat as markdown text
      partials.push({ score_ai: 0, markdown: txt });
    }
    // progress callback per chunk (1-based done count)
    try { ctx?.onProgress?.(idx + 1, chunks.length); } catch {}
  }

  // Aggregate (sanitize any leftover JSON-looking markdown)
  const sanitized = partials.map(p => {
    let md = p.markdown || '';
    // If markdown still looks like JSON object or a fenced block, try to parse/replace
    if (/^\s*\{[\s\S]*\}\s*$/.test(md)) {
      const parsed = tryParseSummaryJson(md);
      if (parsed?.markdown) md = parsed.markdown;
    }
    if (md.includes('```')) {
      md = replaceJsonFencesWithMarkdown(md);
    }
    return { score_ai: p.score_ai || 0, markdown: md };
  });
  const scoreAvg = sanitized.length ? Math.round(sanitized.reduce((s, p) => s + (p.score_ai || 0), 0) / sanitized.length) : 0;
  let combinedMd = sanitized.map((p, i) => (p.markdown?.trim() ? `### 分片 ${i+1}\n\n${p.markdown.trim()}` : '')).filter(Boolean).join('\n\n');
  // Final pass: in case any leftover fenced JSON blocks remain
  if (combinedMd.includes('```')) combinedMd = replaceJsonFencesWithMarkdown(combinedMd);
  const header = `# 今日改动总结（分片合并）\n\n`;
  const finalMd = header + combinedMd;
  const durationMs = Date.now() - t0;
  return { text: JSON.stringify({ score_ai: scoreAvg, markdown: finalMd }), model, provider, tokens: totalTokens, durationMs, chunksCount: chunks.length };
}
