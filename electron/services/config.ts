import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

export type AppConfig = {
  openaiApiKey?: string;
  repoPath?: string;
  lastProcessedCommit?: string | null;
  lastSummaryDate?: string | null; // YYYY-MM-DD
  aiProvider?: 'openai' | 'deepseek' | 'custom';
  aiModel?: string; // e.g., gpt-4o-mini, deepseek-chat
  aiBaseUrl?: string; // for deepseek/custom provider
  aiApiKey?: string; // generic ai key; fallback chain: aiApiKey -> openaiApiKey -> env
};

const defaults: AppConfig = {
  lastProcessedCommit: null,
  lastSummaryDate: null,
  aiProvider: 'openai',
  aiModel: 'gpt-4o-mini',
};

function configPath() {
  const dir = app.getPath('userData');
  return path.join(dir, 'achievo-config.json');
}

export async function getConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(configPath(), 'utf-8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export async function setConfig(cfg: AppConfig): Promise<void> {
  const merged = { ...(await getConfig()), ...cfg };
  await fs.writeFile(configPath(), JSON.stringify(merged, null, 2), 'utf-8');
}
