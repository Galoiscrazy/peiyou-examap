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
function runClaude(prompt: string, cwd?: string, onProgress?: ProgressCallback, timeoutMs?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;  // prevent nested Claude Code detection

    const args = [
      '--print',
      '--output-format', 'text',
      '--dangerously-skip-permissions',  // required: skip permission prompts in non-interactive mode
      '--allowedTools', 'Read',          // safety: only allow Read tool
      '--max-turns', '5',
    ];

    console.log(`[Claude] Running: ${CLAUDE_CLI} ${args.join(' ')}`);
    console.log(`[Claude] Prompt length: ${prompt.length}, CWD: ${cwd || process.cwd()}`);

    if (onProgress) onProgress('Claude CLI 已启动，正在读取图片...', 15);

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

/**
 * Parse Claude's response into structured result.
 */
function parseAnalysisResult(stdout: string): AnalysisResult {
  const codeBlockMatch = stdout.match(/```json\s*([\s\S]*?)\s*```/);
  const rawJsonMatch = stdout.match(/\{[\s\S]*"solution"[\s\S]*"answer"[\s\S]*"knowledgePoints"[\s\S]*\}/);
  const jsonStr = (codeBlockMatch ? codeBlockMatch[1] : null) ||
                  (rawJsonMatch ? rawJsonMatch[0] : null) ||
                  stdout.trim();

  // Try 1: direct parse
  try {
    const parsed = JSON.parse(jsonStr);
    return normalize(parsed);
  } catch { /* continue */ }

  // Try 2: fix unescaped quotes
  try {
    const fixed = fixJsonUnescapedQuotes(jsonStr);
    const parsed = JSON.parse(fixed);
    return normalize(parsed);
  } catch { /* continue */ }

  // Try 3: extract fields with regex
  try {
    const solMatch = jsonStr.match(/"solution"\s*:\s*"([\s\S]*?)"\s*,\s*"answer"/);
    const ansMatch = jsonStr.match(/"answer"\s*:\s*"([\s\S]*?)"\s*,\s*"knowledgePoints"/);
    const kpMatch = jsonStr.match(/"knowledgePoints"\s*:\s*(\[[\s\S]*?\])/);
    const ocrMatch = jsonStr.match(/"ocrText"\s*:\s*"([\s\S]*?)"\s*[,}]/);
    const errMatch = jsonStr.match(/"errorReason"\s*:\s*"([\s\S]*?)"\s*[,}]/);
    if (solMatch || ansMatch) {
      return {
        solution: solMatch ? solMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '',
        answer: ansMatch ? ansMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '',
        knowledgePoints: kpMatch ? JSON.parse(kpMatch[1]) : [],
        ocrText: ocrMatch ? ocrMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '',
        errorReason: errMatch ? errMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '',
      };
    }
  } catch { /* continue */ }

  // Fallback: raw text
  return {
    solution: stdout.trim() || '(AI未返回有效内容)',
    answer: '(AI返回格式异常，请查看解题思路)',
    knowledgePoints: [],
    ocrText: '',
    errorReason: '',
  };
}

function normalize(parsed: Record<string, unknown>): AnalysisResult {
  return {
    solution: (parsed.solution as string) || '',
    answer: (parsed.answer as string) || '',
    knowledgePoints: Array.isArray(parsed.knowledgePoints) ? parsed.knowledgePoints : [],
    ocrText: (parsed.ocrText as string) || '',
    errorReason: (parsed.errorReason as string) || '',
  };
}

/**
 * Phase 1: Read image → OCR + solution + answer + error reason.
 * No knowledge points in prompt = much shorter prompt, faster.
 */
async function phase1_analyzeImage(absolutePath: string, onProgress?: ProgressCallback, isLargeQuestion?: boolean): Promise<{ solution: string; answer: string; ocrText: string; errorReason: string }> {
  const prompt = `请先使用Read工具读取并查看这张物理题目的图片文件，然后分析题目。

图片文件的绝对路径：${absolutePath}

请先读取上面的图片文件，看到题目内容后，完成以下任务：

1. **解题思路**：给出清晰的解题步骤（用中文）
2. **答案**：给出最终答案
3. **OCR提取**：提取图片中题目的完整文字内容，保留原有的排版格式（编号、子题结构、换行等）
4. **错误原因**：仔细观察图片中是否有学生的做题痕迹（手写笔迹、圈画、计算过程、勾选的答案等）。如果有学生做题痕迹，请分析学生的错误原因，用简洁明确的语言描述（1-2句话）。如果图片中没有任何学生做题痕迹（即只是一道干净的题目），则返回空字符串。

请严格按以下JSON格式输出（不要输出其他内容）：
\`\`\`json
{
  "solution": "解题思路...",
  "answer": "最终答案...",
  "ocrText": "题目原文...",
  "errorReason": "错误原因（无学生痕迹则为空字符串）"
}
\`\`\``;

  const timeoutMs = isLargeQuestion ? 600_000 : 300_000;
  const stdout = await runClaude(prompt, path.dirname(absolutePath), onProgress, timeoutMs);
  const result = parsePhase1Result(stdout);
  return result;
}

/**
 * Parse Phase 1 result (no knowledgePoints field).
 */
function parsePhase1Result(stdout: string): { solution: string; answer: string; ocrText: string; errorReason: string } {
  const codeBlockMatch = stdout.match(/```json\s*([\s\S]*?)\s*```/);
  const rawJsonMatch = stdout.match(/\{[\s\S]*"solution"[\s\S]*"answer"[\s\S]*\}/);
  const jsonStr = (codeBlockMatch ? codeBlockMatch[1] : null) ||
                  (rawJsonMatch ? rawJsonMatch[0] : null) ||
                  stdout.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      solution: (parsed.solution as string) || '',
      answer: (parsed.answer as string) || '',
      ocrText: (parsed.ocrText as string) || '',
      errorReason: (parsed.errorReason as string) || '',
    };
  } catch { /* continue */ }

  try {
    const fixed = fixJsonUnescapedQuotes(jsonStr);
    const parsed = JSON.parse(fixed);
    return {
      solution: (parsed.solution as string) || '',
      answer: (parsed.answer as string) || '',
      ocrText: (parsed.ocrText as string) || '',
      errorReason: (parsed.errorReason as string) || '',
    };
  } catch { /* continue */ }

  // Fallback: raw text as solution
  return {
    solution: stdout.trim() || '(AI未返回有效内容)',
    answer: '(AI返回格式异常)',
    ocrText: '',
    errorReason: '',
  };
}

/**
 * Phase 2: Given OCR text and solution → match knowledge points.
 * Pure text, no image reading needed = very fast.
 */
async function phase2_matchKnowledgePoints(ocrText: string, solution: string, onProgress?: ProgressCallback): Promise<{ seq: number; reason: string }[]> {
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

  // Phase 2 is text-only, no image, no Read tool needed — use shorter timeout and no tools
  const stdout = await runClaude(prompt, undefined, onProgress, 120_000);
  return parsePhase2Result(stdout);
}

/**
 * Parse Phase 2 result (only knowledgePoints).
 */
function parsePhase2Result(stdout: string): { seq: number; reason: string }[] {
  const codeBlockMatch = stdout.match(/```json\s*([\s\S]*?)\s*```/);
  const rawJsonMatch = stdout.match(/\{[\s\S]*"knowledgePoints"[\s\S]*\}/);
  const jsonStr = (codeBlockMatch ? codeBlockMatch[1] : null) ||
                  (rawJsonMatch ? rawJsonMatch[0] : null) ||
                  stdout.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed.knowledgePoints) ? parsed.knowledgePoints : [];
  } catch { /* continue */ }

  try {
    const fixed = fixJsonUnescapedQuotes(jsonStr);
    const parsed = JSON.parse(fixed);
    return Array.isArray(parsed.knowledgePoints) ? parsed.knowledgePoints : [];
  } catch { /* continue */ }

  // Try array extraction
  try {
    const kpMatch = jsonStr.match(/"knowledgePoints"\s*:\s*(\[[\s\S]*?\])/);
    if (kpMatch) return JSON.parse(kpMatch[1]);
  } catch { /* continue */ }

  return [];
}

/**
 * Analyze a physics question image using two-phase Claude CLI calls.
 * Phase 1: Read image → OCR + solution + answer + error reason (no KP list, fast)
 * Phase 2: Text-only → match knowledge points (no image, very fast)
 */
export async function analyzeQuestion(imagePath: string, onProgress?: ProgressCallback, isLargeQuestion?: boolean): Promise<AnalysisResult> {
  const absolutePath = path.resolve(imagePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Image file not found: ${absolutePath}`);
  }

  // Phase 1: image analysis (OCR + solution + answer + error reason)
  if (onProgress) onProgress('第1步：AI正在读取图片并分析题目...', 10);
  const phase1 = await phase1_analyzeImage(absolutePath, (msg, pct) => {
    // Map phase1 progress to 10%-70% range
    if (onProgress) onProgress(`第1步：${msg}`, 10 + Math.round(pct * 0.6));
  }, isLargeQuestion);

  // Phase 2: knowledge point matching (text-only, fast)
  if (onProgress) onProgress('第2步：正在匹配知识点...', 75);
  const knowledgePoints = await phase2_matchKnowledgePoints(phase1.ocrText, phase1.solution, (msg, pct) => {
    // Map phase2 progress to 75%-95% range
    if (onProgress) onProgress(`第2步：${msg}`, 75 + Math.round(pct * 0.2));
  });

  if (onProgress) onProgress('分析完成！', 100);

  return {
    solution: phase1.solution,
    answer: phase1.answer,
    ocrText: phase1.ocrText,
    errorReason: phase1.errorReason,
    knowledgePoints,
  };
}

/**
 * Alias for analyzeQuestion.
 */
export async function analyzeQuestionWithFile(imagePath: string, onProgress?: ProgressCallback, isLargeQuestion?: boolean): Promise<AnalysisResult> {
  return analyzeQuestion(imagePath, onProgress, isLargeQuestion);
}
