import { getConfig } from './config';
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

export async function summarizeUnifiedDiff(diffText: string): Promise<string> {
  const cfg = await getConfig();
  const provider = cfg.aiProvider || 'openai';
  const model = cfg.aiModel || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');
  const baseURL = cfg.aiBaseUrl || (provider === 'deepseek' ? 'https://api.deepseek.com' : undefined);
  const apiKey = cfg.aiApiKey || cfg.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('缺少 AI API Key');

  const client = new OpenAI({ apiKey, baseURL });
  const system = '你是资深代码审阅助手，会基于统一 diff 内容，按文件和变更类型（新增/删除/重构/重命名/重要逻辑变动）提炼要点，突出对质量、性能、安全性、可维护性的影响，并给出简明建议。';
  const user = `请用中文总结以下“今天以来”的代码改动（统一 diff 文本）。输出包含：\n`
    + `1) 关键变更点（按文件归纳）\n`
    + `2) 价值/风险\n`
    + `3) 后续行动建议\n`
    + `---\n`
    + diffText.slice(0, 60000); // 限长，避免超出上限

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
