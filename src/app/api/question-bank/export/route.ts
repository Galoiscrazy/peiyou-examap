import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import sizeOf from 'image-size';

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

function getTopicName(questions: Record<string, unknown>[]): string {
  const kpCount: Record<string, number> = {};
  for (const q of questions) {
    const kps = q.knowledge_points as { level2: string; level3: string }[];
    for (const kp of kps) {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { questionIds } = body;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return NextResponse.json({ error: '请选择至少一道题目' }, { status: 400 });
    }

    const db = getDb();
    const placeholders = questionIds.map(() => '?').join(',');

    const questions = db.prepare(`
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = questions.map(q => {
      const kps = JSON.parse(q.knowledge_points as string).filter((kp: { seq: number | null }) => kp.seq !== null);
      return { ...q, knowledge_points: kps } as any;
    });

    const topicName = getTopicName(parsed);
    const dataDir = path.join(process.cwd(), 'data', 'uploads');

    // Build LaTeX content
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

    const zip = new JSZip();
    const imagesFolder = zip.folder('images')!;

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      const num = i + 1;
      const kps = q.knowledge_points as { seq: number; level1: string; level2: string; level3: string; difficulty: number }[];

      latex += '\\section{题目 ' + num + '}\n\n';

      // Knowledge map info
      if (kps.length > 0) {
        latex += '\\begin{tcolorbox}[colback=blue!5,colframe=blue!50,title=考点地图]\n';
        for (const kp of kps) {
          const stars = '★'.repeat(kp.difficulty) + '☆'.repeat(5 - kp.difficulty);
          latex += escapeLatex(kp.level1) + ' $\\rightarrow$ ' + escapeLatex(kp.level2) + ' $\\rightarrow$ ' + escapeLatex(kp.level3) + ' \\quad ' + stars + '\\\\\n';
        }
        latex += '\\end{tcolorbox}\n\n';
      }

      // Image
      const imagePath = q.image_path as string;
      if (imagePath) {
        const filename = path.basename(imagePath);
        const fullPath = path.join(dataDir, filename);
        if (existsSync(fullPath)) {
          const imageBuffer = readFileSync(fullPath);
          imagesFolder.file(filename, imageBuffer);

          try {
            const dims = sizeOf(imageBuffer);
            const w = dims.width || 600;
            const h = dims.height || 400;
            const maxWidth = 14; // cm
            const scale = Math.min(1, maxWidth / (w * 0.0264583));
            const widthCm = Math.round(w * 0.0264583 * scale * 10) / 10;
            latex += '\\includegraphics[width=' + widthCm + 'cm]{images/' + filename + '}\n\n';
          } catch {
            latex += '\\includegraphics[width=14cm]{images/' + filename + '}\n\n';
          }
        }
      }

      // OCR text
      const ocrText = q.ocr_text as string;
      if (ocrText) {
        latex += '\\subsection*{题目文本}\n';
        latex += '\\begin{verbatim}\n' + ocrText + '\n\\end{verbatim}\n\n';
      }

      // Answer
      const answer = q.ai_answer as string;
      if (answer) {
        latex += '\\subsection*{参考答案}\n';
        latex += escapeLatex(answer) + '\n\n';
      }

      // Solution
      const solution = q.ai_solution as string;
      if (solution) {
        latex += '\\subsection*{解析}\n';
        latex += escapeLatex(solution) + '\n\n';
      }

      if (i < parsed.length - 1) {
        latex += '\\newpage\n\n';
      }
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
  } catch (err) {
    console.error('[Export Error]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '导出失败' },
      { status: 500 }
    );
  }
}
