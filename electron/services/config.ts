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
  // Dashboard polling interval for DB/live stats (seconds)
  dbPollSeconds?: number;
  // Daily cap ratio for base score increment (0..1), e.g., 0.35 = 35%
  dailyCapRatio?: number;
  // Developer logging options
  logLevel?: 'debug' | 'info' | 'error';
  logNamespaces?: string[]; // e.g., ['db','score','ai']
  logToFile?: boolean; // write JSONL logs to userData/logFileName
  logFileName?: string; // default achievo.log
  // Local scoring normalization parameters (ECDF + cold-start + smoothing)
  localScoring?: {
    coldStartN?: number;    // number of days to treat as calibration (no ECDF)
    windowDays?: number;    // history window for ECDF
    alpha?: number;         // smoothing weight for today vs yesterday (0..1)
    capCold?: number;       // max score during cold start
    capStable?: number;     // max score after calibration
    winsorPLow?: number;    // lower winsor percentile (0..1)
    winsorPHigh?: number;   // upper winsor percentile (0..1)
    normalMean?: number;    // fallback normal CDF mean for cold start
    normalStd?: number;     // fallback normal CDF std for cold start
    regressionCapAfterHigh?: number; // cap when yesterday extremely high
    highThreshold?: number; // threshold to trigger regression cap
  };
};

const defaults: AppConfig = {
  lastProcessedCommit: null,
  lastSummaryDate: null,
  aiProvider: 'openai',
  aiModel: 'gpt-4o-mini',
  dbPollSeconds: 10,
  dailyCapRatio: 0.35,
  logLevel: 'info',
  logNamespaces: [],
  logToFile: false,
  logFileName: 'achievo.log',
  localScoring: {
    coldStartN: 3,
    windowDays: 30,
    alpha: 0.65,
    capCold: 98,
    capStable: 85,
    winsorPLow: 0.05,
    winsorPHigh: 0.95,
    normalMean: 88,
    normalStd: 14,
    regressionCapAfterHigh: 80,
    highThreshold: 95,
  },
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
