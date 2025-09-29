import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

export type HistoryItem = { timestamp: number; score: number; summary: string };

export class Storage {
  private file: string;

  constructor() {
    const dir = app.getPath('userData');
    this.file = path.join(dir, 'achievo-history.json');
  }

  async getAll(): Promise<HistoryItem[]> {
    try {
      const buf = await fs.readFile(this.file, 'utf-8');
      return JSON.parse(buf);
    } catch {
      return [];
    }
  }

  async append(item: HistoryItem): Promise<void> {
    const all = await this.getAll();
    all.push(item);
    await fs.writeFile(this.file, JSON.stringify(all, null, 2), 'utf-8');
  }
}
