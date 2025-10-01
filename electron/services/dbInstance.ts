import { DB } from './db_sqljs';

// Shared singleton DB instance to avoid divergence between multiple sql.js in-memory DBs
export const db = new DB();
