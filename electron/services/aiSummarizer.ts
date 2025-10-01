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

export async function summarizeUnifiedDiff(
  diffText: string,
  ctx?: { insertions?: number; deletions?: number; prevBaseScore?: number; localScore?: number; features?: DiffFeatures }
): Promise<string> {
  // Quick local heuristic: only short-circuit when truly empty
  try {
    const trimmed = diffText.trim();
    if (!trimmed) return JSON.stringify({ score: 0, markdown: '今日无代码改动' });
    // If there is at least a diff header, proceed to AI summary regardless of +/- counts
    if (!trimmed.includes('diff --git')) {
      // Fallback check for any +/- lines excluding headers
      const lines = trimmed.split(/\r?\n/);
      let signal = false;
      for (const l of lines) {
        if (l.startsWith('+++') || l.startsWith('---') || l.startsWith('@@')) continue;
        if (l.startsWith('+') || l.startsWith('-')) { signal = true; break; }
      }
      if (!signal) return JSON.stringify({ score: 0, markdown: '今日无代码改动' });
    }
  } catch {}

  const cfg = await getConfig();
  const provider = cfg.aiProvider || 'openai';
  const model = cfg.aiModel || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');
  const baseURL = cfg.aiBaseUrl || (provider === 'deepseek' ? 'https://api.deepseek.com' : undefined);
  const apiKey = cfg.aiApiKey || cfg.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('缺少 AI API Key');

  const client = new OpenAI({ apiKey, baseURL });
  const system = '你是资深代码审阅助手。请只输出严格的 JSON，不要任何额外文本。JSON 格式如下：\n' +
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

  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
  });
  const text2 = resp.choices?.[0]?.message?.content?.trim();
  return text2 || '（无内容）';
}
