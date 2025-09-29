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
