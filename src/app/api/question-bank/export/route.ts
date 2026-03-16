import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import {
  Document, Packer, Paragraph, TextRun, ImageRun,
  HeadingLevel, BorderStyle, AlignmentType,
  Table, TableRow, TableCell, WidthType,
} from 'docx';
import sizeOf from 'image-size';

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

    const dataDir = path.join(process.cwd(), 'data', 'uploads');
    const sections: Paragraph[] = [];

    // Title
    sections.push(new Paragraph({
      text: `物理题目导出 (${parsed.length}题)`,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }));

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      const kps = q.knowledge_points as { seq: number; level1: string; level2: string; level3: string; difficulty: number }[];

      // Separator between questions
      if (i > 0) {
        sections.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' } },
          spacing: { before: 400, after: 400 },
        }));
      }

      // Question number header
      sections.push(new Paragraph({
        text: `题目 ${i + 1}`,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 200 },
      }));

      // Knowledge point tags
      if (kps.length > 0) {
        const kpRuns: TextRun[] = [
          new TextRun({ text: '考点：', bold: true, size: 22, color: '2563EB' }),
        ];
        for (let k = 0; k < kps.length; k++) {
          const kp = kps[k];
          const stars = '★'.repeat(kp.difficulty) + '☆'.repeat(Math.max(0, 5 - kp.difficulty));
          kpRuns.push(new TextRun({
            text: `${kp.level3} (${stars})`,
            size: 20,
            color: '4B5563',
          }));
          if (k < kps.length - 1) {
            kpRuns.push(new TextRun({ text: '  |  ', size: 20, color: '9CA3AF' }));
          }
        }
        sections.push(new Paragraph({ children: kpRuns, spacing: { after: 200 } }));
      }

      // Image
      const imagePath = q.image_path as string;
      if (imagePath) {
        const filename = path.basename(imagePath);
        const fullPath = path.join(dataDir, filename);
        if (existsSync(fullPath)) {
          try {
            const imageBuffer = readFileSync(fullPath);
            const dims = sizeOf(imageBuffer);
            const w = dims.width || 600;
            const h = dims.height || 400;
            // Scale to max 500px wide, keep aspect ratio
            const maxW = 500;
            const scale = Math.min(1, maxW / w);
            const dispW = Math.round(w * scale);
            const dispH = Math.round(h * scale);

            sections.push(new Paragraph({
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: { width: dispW, height: dispH },
                  type: 'jpg',
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
      const ocrText = q.ocr_text as string;
      if (ocrText && ocrText.trim()) {
        sections.push(new Paragraph({
          text: '题目文本',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }));
        // Split OCR text by lines to preserve formatting
        for (const line of ocrText.split('\n')) {
          sections.push(new Paragraph({
            children: [new TextRun({ text: line, size: 22 })],
            spacing: { after: 40 },
          }));
        }
      }

      // Answer
      const answer = q.ai_answer as string;
      if (answer && answer.trim()) {
        sections.push(new Paragraph({
          text: '参考答案',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }));
        sections.push(new Paragraph({
          children: [new TextRun({ text: answer, size: 22, bold: true, color: '059669' })],
          spacing: { after: 200 },
        }));
      }

      // Solution
      const solution = q.ai_solution as string;
      if (solution && solution.trim()) {
        sections.push(new Paragraph({
          text: '解题过程',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }));
        for (const line of solution.split('\n')) {
          sections.push(new Paragraph({
            children: [new TextRun({ text: line, size: 21 })],
            spacing: { after: 40 },
          }));
        }
      }
    }

    const doc = new Document({
      sections: [{ children: sections }],
    });

    const buffer = await Packer.toBuffer(doc);
    const uint8 = new Uint8Array(buffer);

    return new Response(uint8, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent('物理题目导出')}.docx"`,
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
