import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import sizeOf from 'image-size';
import {
  Document, Packer, Paragraph, TextRun, ImageRun,
  HeadingLevel, BorderStyle, AlignmentType,
} from 'docx';

// ============ Shared ============

interface ParsedQuestion {
  id: number;
  image_path: string;
  ocr_text: string;
  ai_answer: string;
  ai_solution: string;
  student_name: string;
  created_at: string;
  knowledge_points: { seq: number; level1: string; level2: string; level3: string; difficulty: number }[];
}

function getTopicName(questions: ParsedQuestion[]): string {
  const kpCount: Record<string, number> = {};
  for (const q of questions) {
    for (const kp of q.knowledge_points) {
      const key = kp.level3 || kp.level2;
      if (key) kpCount[key] = (kpCount[key] || 0) + 1;
    }
  }
  const sorted = Object.entries(kpCount).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    const topic = sorted[0][0];
    return topic.length > 10 ? topic.slice(0, 10) : topic;
  }
  return '物理题目';
}

function fetchQuestions(questionIds: number[]): ParsedQuestion[] {
  const db = getDb();
  const placeholders = questionIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT q.*, s.name as student_name,
      json_group_array(json_object(
        'seq', qkp.knowledge_point_seq,
        'level1', kp.level1,
        'level2', kp.level2,
        'level3', kp.level3,
        'difficulty', kp.difficulty
      )) as knowledge_points
    FROM questions q
    JOIN students s ON s.id = q.student_id
    LEFT JOIN question_knowledge_points qkp ON qkp.question_id = q.id
    LEFT JOIN knowledge_points kp ON kp.seq_number = qkp.knowledge_point_seq
    WHERE q.id IN (${placeholders})
    GROUP BY q.id
    ORDER BY q.created_at DESC
  `).all(...questionIds) as Record<string, unknown>[];

  return rows.map(q => {
    const kps = JSON.parse(q.knowledge_points as string).filter((kp: { seq: number | null }) => kp.seq !== null);
    return { ...q, knowledge_points: kps } as ParsedQuestion;
  });
}

// ============ LaTeX Export ============

function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

async function exportLatex(parsed: ParsedQuestion[], topicName: string): Promise<Response> {
  const dataDir = path.join(process.cwd(), 'data', 'uploads');
  const zip = new JSZip();
  const imagesFolder = zip.folder('images')!;

  let latex = '\\documentclass[12pt,a4paper]{ctexart}\n';
  latex += '\\usepackage{graphicx}\n';
  latex += '\\usepackage{geometry}\n';
  latex += '\\usepackage{enumitem}\n';
  latex += '\\usepackage{xcolor}\n';
  latex += '\\usepackage{tcolorbox}\n';
  latex += '\\geometry{left=2cm,right=2cm,top=2cm,bottom=2cm}\n\n';
  latex += '\\title{' + escapeLatex(topicName) + '专题}\n';
  latex += '\\date{\\today}\n\n';
  latex += '\\begin{document}\n';
  latex += '\\maketitle\n\n';

  for (let i = 0; i < parsed.length; i++) {
    const q = parsed[i];
    const kps = q.knowledge_points;

    latex += '\\section{题目 ' + (i + 1) + '}\n\n';

    if (kps.length > 0) {
      latex += '\\begin{tcolorbox}[colback=blue!5,colframe=blue!50,title=考点地图]\n';
      for (const kp of kps) {
        const stars = '\u2605'.repeat(kp.difficulty) + '\u2606'.repeat(5 - kp.difficulty);
        latex += escapeLatex(kp.level1) + ' $\\rightarrow$ ' + escapeLatex(kp.level2) + ' $\\rightarrow$ ' + escapeLatex(kp.level3) + ' \\quad ' + stars + '\\\\\n';
      }
      latex += '\\end{tcolorbox}\n\n';
    }

    if (q.image_path) {
      // 数据库里存的是绝对路径，直接用；也兼容相对路径
      const fullPath = path.isAbsolute(q.image_path) ? q.image_path : path.join(dataDir, path.basename(q.image_path));
      const filename = path.basename(fullPath);
      if (existsSync(fullPath)) {
        const imageBuffer = readFileSync(fullPath);
        imagesFolder.file(filename, imageBuffer);
        try {
          const dims = sizeOf(imageBuffer);
          const w = dims.width || 600;
          const maxWidth = 14;
          const scale = Math.min(1, maxWidth / (w * 0.0264583));
          const widthCm = Math.round(w * 0.0264583 * scale * 10) / 10;
          latex += '\\includegraphics[width=' + widthCm + 'cm]{images/' + filename + '}\n\n';
        } catch {
          latex += '\\includegraphics[width=14cm]{images/' + filename + '}\n\n';
        }
      }
    }

    if (q.ocr_text) {
      latex += '\\subsection*{题目文本}\n';
      latex += '\\begin{verbatim}\n' + q.ocr_text + '\n\\end{verbatim}\n\n';
    }

    if (q.ai_answer) {
      latex += '\\subsection*{参考答案}\n';
      latex += escapeLatex(q.ai_answer) + '\n\n';
    }

    if (q.ai_solution) {
      latex += '\\subsection*{解析}\n';
      latex += escapeLatex(q.ai_solution) + '\n\n';
    }

    if (i < parsed.length - 1) latex += '\\newpage\n\n';
  }

  latex += '\\end{document}\n';
  zip.file(`${topicName}专题.tex`, latex);

  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(topicName + '专题')}.zip"`,
    },
  });
}

// ============ DOCX Export ============

async function exportDocx(parsed: ParsedQuestion[], topicName: string): Promise<Response> {
  const dataDir = path.join(process.cwd(), 'data', 'uploads');
  const sections: Paragraph[] = [];

  sections.push(new Paragraph({
    text: `${topicName}专题 (${parsed.length}题)`,
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }));

  for (let i = 0; i < parsed.length; i++) {
    const q = parsed[i];
    const kps = q.knowledge_points;

    if (i > 0) {
      sections.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' } },
        spacing: { before: 400, after: 400 },
      }));
    }

    sections.push(new Paragraph({
      text: `题目 ${i + 1}`,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 200 },
    }));

    // Knowledge points
    if (kps.length > 0) {
      const kpRuns: TextRun[] = [
        new TextRun({ text: '考点：', bold: true, size: 22, color: '2563EB' }),
      ];
      for (let k = 0; k < kps.length; k++) {
        const kp = kps[k];
        const stars = '\u2605'.repeat(kp.difficulty) + '\u2606'.repeat(Math.max(0, 5 - kp.difficulty));
        kpRuns.push(new TextRun({ text: `${kp.level3} (${stars})`, size: 20, color: '4B5563' }));
        if (k < kps.length - 1) kpRuns.push(new TextRun({ text: '  |  ', size: 20, color: '9CA3AF' }));
      }
      sections.push(new Paragraph({ children: kpRuns, spacing: { after: 200 } }));
    }

    // Image
    if (q.image_path) {
      const fullPath = path.isAbsolute(q.image_path) ? q.image_path : path.join(dataDir, path.basename(q.image_path));
      if (existsSync(fullPath)) {
        try {
          const imageBuffer = readFileSync(fullPath);
          const dims = sizeOf(imageBuffer);
          const w = dims.width || 600;
          const h = dims.height || 400;
          const maxW = 500;
          const scale = Math.min(1, maxW / w);
          const ext = path.extname(fullPath).toLowerCase();
          const imgType = ext === '.png' ? 'png' : 'jpg';
          sections.push(new Paragraph({
            children: [
              new ImageRun({
                data: imageBuffer,
                transformation: { width: Math.round(w * scale), height: Math.round(h * scale) },
                type: imgType,
              }),
            ],
            spacing: { after: 200 },
          }));
        } catch {
          sections.push(new Paragraph({
            children: [new TextRun({ text: '[图片加载失败]', italics: true, color: 'EF4444' })],
          }));
        }
      }
    }

    // OCR text
    if (q.ocr_text?.trim()) {
      sections.push(new Paragraph({ text: '题目文本', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
      for (const line of q.ocr_text.split('\n')) {
        sections.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })], spacing: { after: 40 } }));
      }
    }

    // Answer
    if (q.ai_answer?.trim()) {
      sections.push(new Paragraph({ text: '参考答案', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
      sections.push(new Paragraph({
        children: [new TextRun({ text: q.ai_answer, size: 22, bold: true, color: '059669' })],
        spacing: { after: 200 },
      }));
    }

    // Solution
    if (q.ai_solution?.trim()) {
      sections.push(new Paragraph({ text: '解题过程', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
      for (const line of q.ai_solution.split('\n')) {
        sections.push(new Paragraph({ children: [new TextRun({ text: line, size: 21 })], spacing: { after: 40 } }));
      }
    }
  }

  const doc = new Document({ sections: [{ children: sections }] });
  const buffer = await Packer.toBuffer(doc);

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(topicName + '专题')}.docx"`,
    },
  });
}

// ============ Route Handler ============

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { questionIds, format = 'latex' } = body;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return NextResponse.json({ error: '请选择至少一道题目' }, { status: 400 });
    }

    const parsed = fetchQuestions(questionIds);
    const topicName = getTopicName(parsed);

    if (format === 'docx') {
      return await exportDocx(parsed, topicName);
    } else {
      return await exportLatex(parsed, topicName);
    }
  } catch (err) {
    console.error('[Export Error]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '导出失败' },
      { status: 500 }
    );
  }
}
