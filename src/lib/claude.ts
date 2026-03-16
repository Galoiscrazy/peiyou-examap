import { spawn } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import path from 'path';
import { getDb } from './db';

/**
 * Find the Claude CLI executable path.
 */
function findClaudeCli(): string {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'claude'),
    path.join(home, '.claude', 'local', 'claude.exe'),
    'claude',
  ];

  for (const p of candidates) {
    if (p === 'claude') return p;
    if (existsSync(p)) {
      console.log(`[Claude CLI] Found at: ${p}`);
      return p;
    }
  }
  return 'claude';
}

const CLAUDE_CLI = findClaudeCli();

export interface AnalysisResult {
  solution: string;
  answer: string;
  knowledgePoints: {
    seq: number;
    reason: string;
  }[];
  ocrText: string;
  errorReason: string;
}

export type ProgressCallback = (message: string, percent: number) => void;

/**
 * Get a compact summary of knowledge points for the AI prompt.
 */
function getKnowledgePointsSummary(): string {
  const db = getDb();
  const rows = db.prepare(`
    SELECT seq_number, level1, level2, level3, difficulty
    FROM knowledge_points
    ORDER BY seq_number
  `).all() as { seq_number: number; level1: string; level2: string; level3: string; difficulty: number }[];

  let currentL1 = '';
  let currentL2 = '';
  const lines: string[] = [];

  for (const row of rows) {
    if (row.level1 !== currentL1) {
      currentL1 = row.level1;
      lines.push(`\n## ${row.level1}`);
    }
    if (row.level2 !== currentL2) {
      currentL2 = row.level2;
      lines.push(`  ### ${row.level2}`);
    }
    lines.push(`    [${row.seq_number}] ${row.level3} (${'★'.repeat(row.difficulty)})`);
  }

  return lines.join('\n');
}

/**
 * Call Claude CLI asynchronously (non-blocking).
 * Uses async spawn so the event loop stays free (HMR stays alive, no page reload).
 */
interface RunClaudeOptions {
  cwd?: string;
  onProgress?: ProgressCallback;
  timeoutMs?: number;
  needsTools?: boolean;  // true = needs Read tool (image phase), false = pure text (faster)
}

function runClaude(prompt: string, options: RunClaudeOptions = {}): Promise<string> {
  const { cwd, onProgress, timeoutMs, needsTools = true } = options;
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;  // prevent nested Claude Code detection

    const args = [
      '--print',
      '--output-format', 'text',
      '--dangerously-skip-permissions',
    ];

    if (needsTools) {
      // Image phase: needs Read tool, allow enough turns to read + respond
      args.push('--allowedTools', 'Read', '--max-turns', '3');
    } else {
      // Pure text phase: no tools, single turn = much faster
      args.push('--max-turns', '1');
    }

    console.log(`[Claude] Running: ${CLAUDE_CLI} ${args.join(' ')}`);
    console.log(`[Claude] Prompt length: ${prompt.length}, CWD: ${cwd || process.cwd()}`);

    if (onProgress) onProgress(needsTools ? 'Claude CLI 已启动，正在读取图片...' : 'Claude CLI 已启动，正在处理...', 15);

    const child = spawn(CLAUDE_CLI, args, {
      shell: true,
      cwd: cwd || process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let gotFirstData = false;

    // Progress ticker: advance from 20% to 85% every 30 seconds
    let progressPercent = 20;
    const progressTimer = setInterval(() => {
      if (!settled && onProgress && progressPercent < 85) {
        progressPercent = Math.min(progressPercent + 5, 85);
        const elapsed = Math.round((progressPercent - 20) * 30 / 5);
        onProgress(`AI正在分析题目... (已用时约${elapsed}秒)`, progressPercent);
      }
    }, 30000);

    function finish(result: string | null, error?: string) {
      if (settled) return;
      settled = true;
      clearInterval(progressTimer);
      child.kill();

      // Write debug info
      try {
        writeFileSync(path.join(process.cwd(), 'data', '_claude_debug.txt'),
          [
            `[Command] ${CLAUDE_CLI} ${args.join(' ')}`,
            `[Settled] result=${result ? result.length + ' chars' : 'null'}, error=${error || 'none'}`,
            `[STDOUT] (${stdout.length} chars):`,
            stdout.slice(0, 5000),
            `\n[STDERR] (${stderr.length} chars):`,
            stderr.slice(0, 2000),
          ].join('\n')
        );
      } catch {}

      if (result) {
        console.log(`[Claude] Success: ${result.length} chars`);
        resolve(result);
      } else {
        reject(new Error(error || 'Claude CLI failed'));
      }
    }

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (!gotFirstData && onProgress) {
        gotFirstData = true;
        onProgress('AI正在输出分析结果...', 85);
      }
    });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('error', (err) => {
      finish(null, `Claude CLI spawn error: ${err.message}`);
    });

    child.on('close', () => {
      if (onProgress) onProgress('正在解析AI返回结果...', 90);
      stdout.trim() ? finish(stdout) : finish(null, 'Claude CLI returned empty output');
    });

    // Send prompt via stdin
    child.stdin.write(prompt);
    child.stdin.end();

    // Timeout: resolve with whatever stdout we have, or reject
    const timeout = timeoutMs || 300_000;
    setTimeout(() => {
      if (stdout.trim()) {
        finish(stdout);
      } else {
        finish(null, `Claude CLI timed out (${timeout / 1000}s) with no output`);
      }
    }, timeout);
  });
}

/**
 * Fix unescaped double quotes inside JSON string values.
 */
function fixJsonUnescapedQuotes(jsonStr: string): string {
  let result = '';
  let inString = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];

    if (ch === '\\' && inString) {
      result += ch + (jsonStr[i + 1] || '');
      i++;
      continue;
    }

    if (ch === '"') {
      if (!inString) {
        inString = true;
        result += ch;
      } else {
        let j = i + 1;
        while (j < jsonStr.length && /\s/.test(jsonStr[j])) j++;
        const next = jsonStr[j];
        if (!next || ',}]:'.includes(next)) {
          inString = false;
          result += ch;
        } else {
          result += '\\"';
        }
      }
    } else {
      result += ch;
    }
  }
  return result;
}

// ============================================================
// 3-Phase Analysis Pipeline (mimics expert physics solving)
// Phase 1: 看题 — read image → OCR + error reason (needs tools)
// Phase 2: 审题+解题 — analyze & solve in one flow (text-only)
// Phase 3: 归类 — match knowledge points (text-only)
// ============================================================

/**
 * Phase 1: 看题 — Read image, extract text, detect student marks.
 * Only does visual recognition, no solving.
 */
async function phase1_ocr(absolutePath: string, onProgress?: ProgressCallback, timeoutMs = 180_000): Promise<{ ocrText: string; errorReason: string }> {
  const prompt = `请先使用Read工具读取并查看这张物理题目的图片文件。

图片文件的绝对路径：${absolutePath}

请先读取上面的图片文件，然后完成以下任务（只做识别，不要解题）：

1. **OCR提取**：提取图片中题目的完整文字内容，保留原有的排版格式（编号、子题结构、换行等）。如果图中有物理示意图，用文字简要描述图的内容（如"图示一个斜面上有一个滑块，斜面角度θ..."）。
2. **错误原因**：仔细观察图片中是否有学生的做题痕迹（手写笔迹、圈画、计算过程、勾选的答案等）。如果有学生做题痕迹，请分析学生的错误原因，用简洁明确的语言描述（1-2句话）。如果图片中没有任何学生做题痕迹（即只是一道干净的题目），则返回空字符串。

请严格按以下JSON格式输出（不要输出其他内容）：
\`\`\`json
{
  "ocrText": "题目原文...",
  "errorReason": "错误原因（无学生痕迹则为空字符串）"
}
\`\`\``;

  const stdout = await runClaude(prompt, { cwd: path.dirname(absolutePath), onProgress, timeoutMs, needsTools: true });
  return parseJsonFields(stdout, ['ocrText', 'errorReason']) as { ocrText: string; errorReason: string };
}

/**
 * Phase 2: 审题+解题 — Analyze then solve in one continuous flow.
 * Text-only, no image reading. Merging saves one CLI startup (~30-60s).
 */
async function phase2_solve(ocrText: string, onProgress?: ProgressCallback, timeoutMs = 300_000): Promise<{ analysis: string; solution: string; answer: string }> {
  const prompt = `你是一位高考物理解题专家。请像高手一样先审题再解题，一气呵成完成分析。

题目原文：
${ocrText}

请按以下结构输出JSON（不要输出其他内容）：
\`\`\`json
{
  "analysis": "审题分析：包括物理情景（什么模型）、已知量、求解目标、解题策略（用什么定律/原理、分几步）",
  "solution": "解题过程：包括列式、代入数据、计算步骤（用中文书写）",
  "answer": "最终答案（简洁明确）"
}
\`\`\``;

  const stdout = await runClaude(prompt, { onProgress, timeoutMs, needsTools: false });
  const result = parseJsonFields(stdout, ['analysis', 'solution', 'answer']);
  return {
    analysis: (result.analysis as string) || '',
    solution: (result.solution as string) || '',
    answer: (result.answer as string) || '',
  };
}

/**
 * Phase 4: 归类 — Match knowledge points from the 533-item list.
 * Text-only, uses OCR + solution.
 */
async function phase4_matchKnowledgePoints(ocrText: string, solution: string, onProgress?: ProgressCallback, timeoutMs = 120_000): Promise<{ seq: number; reason: string }[]> {
  const knowledgeMap = getKnowledgePointsSummary();

  const prompt = `你是一个高中物理知识点分类专家。请根据以下题目内容和解题思路，从知识点列表中选出最核心典型的1-3个知识点。

题目原文：
${ocrText || '(无OCR文本)'}

解题思路：
${solution}

知识点列表：
${knowledgeMap}

请严格按以下JSON格式输出（不要输出其他内容）：
\`\`\`json
{
  "knowledgePoints": [
    {"seq": 序号数字, "reason": "选择理由"}
  ]
}
\`\`\``;

  const stdout = await runClaude(prompt, { onProgress, timeoutMs, needsTools: false });
  const result = parseJsonFields(stdout, ['knowledgePoints']);
  return Array.isArray(result.knowledgePoints) ? result.knowledgePoints : [];
}

/**
 * Generic JSON field parser with multi-layer fallback.
 */
function parseJsonFields(stdout: string, fields: string[]): Record<string, unknown> {
  const codeBlockMatch = stdout.match(/```json\s*([\s\S]*?)\s*```/);
  const rawJsonMatch = stdout.match(/\{[\s\S]*\}/);
  const jsonStr = (codeBlockMatch ? codeBlockMatch[1] : null) ||
                  (rawJsonMatch ? rawJsonMatch[0] : null) ||
                  stdout.trim();

  // Try 1: direct parse
  try {
    return JSON.parse(jsonStr);
  } catch { /* continue */ }

  // Try 2: fix unescaped quotes
  try {
    return JSON.parse(fixJsonUnescapedQuotes(jsonStr));
  } catch { /* continue */ }

  // Try 3: regex extraction per field
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const match = jsonStr.match(new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"\\s*[,}]`));
    if (match) {
      result[field] = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else {
      result[field] = '';
    }
  }
  if (Object.values(result).some(v => v !== '')) return result;

  // Fallback
  const fallback: Record<string, unknown> = {};
  for (const field of fields) fallback[field] = '';
  if (fields.includes('solution')) fallback.solution = stdout.trim() || '(AI未返回有效内容)';
  if (fields.includes('answer')) fallback.answer = '(AI返回格式异常)';
  return fallback;
}

/**
 * Analyze a physics question image using 3-phase pipeline.
 * Phase 1: 看题 (read image) → Phase 2: 审题+解题 (text) → Phase 3: 归类 (text)
 * Only 3 CLI startups instead of 4, saving ~30-60s overhead.
 */
export async function analyzeQuestion(imagePath: string, onProgress?: ProgressCallback, isLargeQuestion?: boolean): Promise<AnalysisResult> {
  const absolutePath = path.resolve(imagePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Image file not found: ${absolutePath}`);
  }

  // 大题超时翻倍
  const mul = isLargeQuestion ? 2 : 1;
  const label = isLargeQuestion ? '(大题模式) ' : '';

  // Phase 1: 看题 (0% → 30%)
  if (onProgress) onProgress(`${label}第1步/3：正在识别图片内容...`, 5);
  const { ocrText, errorReason } = await phase1_ocr(absolutePath, (msg, pct) => {
    if (onProgress) onProgress(`${label}第1步/3 看题：${msg}`, Math.round(pct * 0.30));
  }, 180_000 * mul);

  // Phase 2: 审题+解题 (30% → 80%)
  if (onProgress) onProgress(`${label}第2步/3：正在审题并求解...`, 33);
  const { analysis, solution: solveSolution, answer } = await phase2_solve(ocrText, (msg, pct) => {
    if (onProgress) onProgress(`${label}第2步/3 解题：${msg}`, 30 + Math.round(pct * 0.50));
  }, 300_000 * mul);

  // Combine analysis + solution for display
  const solution = `【审题分析】\n${analysis}\n\n【解题过程】\n${solveSolution}`;

  // Phase 3: 归类 (80% → 100%)
  if (onProgress) onProgress(`${label}第3步/3：正在匹配知识点标签...`, 83);
  const knowledgePoints = await phase4_matchKnowledgePoints(ocrText, solveSolution, (msg, pct) => {
    if (onProgress) onProgress(`${label}第3步/3 归类：${msg}`, 80 + Math.round(pct * 0.20));
  }, 120_000 * mul);

  if (onProgress) onProgress('分析完成！', 100);

  return {
    solution,
    answer,
    ocrText,
    errorReason,
    knowledgePoints,
  };
}

/**
 * Alias for analyzeQuestion.
 */
export async function analyzeQuestionWithFile(imagePath: string, onProgress?: ProgressCallback, isLargeQuestion?: boolean): Promise<AnalysisResult> {
  return analyzeQuestion(imagePath, onProgress, isLargeQuestion);
}
