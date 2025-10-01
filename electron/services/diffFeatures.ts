import path from 'node:path';

export type DiffFeatures = {
  filesTotal: number;
  codeFiles: number;
  docFiles: number;
  testFiles: number;
  configFiles: number;
  renameOrMove: number;
  additions: number;
  deletions: number;
  hunks: number;
  languages: Record<string, number>; // by file ext
  dependencyChanges: boolean; // package.json, lockfiles, requirements, etc.
  hasSecuritySensitive: boolean; // e.g., changes in auth, crypto, config keys
};

const CODE_EXTS = new Set([
  'ts','tsx','js','jsx','mjs','cjs','go','rs','py','java','kt','c','h','cpp','cc','hpp','rb','php','cs','swift','scala'
]);
const TEST_HINTS = [/\.test\./i, /\.spec\./i, /__tests__/, /tests?\//i];
const DOC_HINTS = [/\.md$/i, /docs?\//i, /\.rst$/i];
const CONFIG_HINTS = [/package\.json$/i, /pnpm-lock\.yaml$/i, /yarn\.lock$/i, /package-lock\.json$/i, /tsconfig\.json$/i, /\.eslintrc/i, /\.prettierrc/i, /vite\.config\./i, /webpack\./i];
const SECURITY_HINTS = [/auth/i, /token/i, /secret/i, /crypto/i, /password/i, /oauth/i];

function classifyFile(filePath: string) {
  const p = filePath.replace(/^a\//,'').replace(/^b\//,'');
  const ext = path.extname(p).replace(/^\./,'').toLowerCase();
  const isCode = CODE_EXTS.has(ext);
  const isDoc = DOC_HINTS.some(r => r.test(p));
  const isTest = TEST_HINTS.some(r => r.test(p));
  const isConfig = CONFIG_HINTS.some(r => r.test(p));
  const isSecurity = SECURITY_HINTS.some(r => r.test(p));
  return { ext, isCode, isDoc, isTest, isConfig, isSecurity };
}

export function extractDiffFeatures(unifiedDiff: string): DiffFeatures {
  const lines = unifiedDiff.split(/\r?\n/);
  const files = new Set<string>();
  let additions = 0, deletions = 0, hunks = 0;
  let codeFiles = 0, docFiles = 0, testFiles = 0, configFiles = 0, renameOrMove = 0, hasSecuritySensitive = false;
  const languages: Record<string, number> = {};
  let currentFile: string | null = null;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const m = line.match(/ a\/(.*?) b\/(.*)$/);
      if (m) {
        currentFile = m[2];
        files.add(currentFile);
        const cls = classifyFile(currentFile);
        if (cls.isCode) { codeFiles++; languages[cls.ext] = (languages[cls.ext]||0) + 1; }
        if (cls.isDoc) docFiles++;
        if (cls.isTest) testFiles++;
        if (cls.isConfig) configFiles++;
        if (cls.isSecurity) hasSecuritySensitive = true;
      }
      continue;
    }
    if (line.startsWith('rename from ') || line.startsWith('rename to ') || line.includes('similarity index')) {
      renameOrMove++;
      continue;
    }
    if (line.startsWith('@@')) {
      hunks++;
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }

  const dependencyChanges = Array.from(files).some(f => CONFIG_HINTS.some(r => r.test(f)));

  return {
    filesTotal: files.size,
    codeFiles,
    docFiles,
    testFiles,
    configFiles,
    renameOrMove,
    additions,
    deletions,
    hunks,
    languages,
    dependencyChanges,
    hasSecuritySensitive,
  };
}
