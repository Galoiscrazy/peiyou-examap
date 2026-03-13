import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, BorderStyle } from 'docx';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import imageSize from 'image-size';

interface QuestionRow {
  id: number;
  image_path: string;
  ocr_text: string;
  ai_answer: string;
  ai_solution: string;
  student_name: string;
  created_at: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { questionIds } = body as { questionIds: number[] };

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return NextResponse.json({ error: '请选择要导出的题目' }, { status: 400 });
    }

    const db = getDb();

    const placeholders = questionIds.map(() => '?').join(',');
    const questions = db.prepare(`
      SELECT q.*, s.name as student_name
      FROM questions q
      JOIN students s ON s.id = q.student_id
      WHERE q.id IN (${placeholders})
      ORDER BY q.created_at DESC
    `).all(...questionIds) as QuestionRow[];

    // Build docx sections
    const children: Paragraph[] = [];

    // Title
    children.push(new Paragraph({
      text: '题库导出',
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }));

    children.push(new Paragraph({
      children: [new TextRun({ text: `共 ${questions.length} 题 | 导出时间: ${new Date().toLocaleString('zh-CN')}`, size: 20, color: '888888' })],
      spacing: { after: 400 },
    }));

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      // Separator line between questions
      if (i > 0) {
        children.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
          spacing: { before: 300, after: 300 },
        }));
      }

      // Question number
      children.push(new Paragraph({
        text: `第 ${i + 1} 题`,
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 100 },
      }));

      // Try to embed image
      const filename = q.image_path.split(/[\\/]/).pop();
      if (filename) {
        const filePath = path.join(process.cwd(), 'data', 'uploads', filename);
        if (existsSync(filePath)) {
          try {
            const imageData = readFileSync(filePath);
            const dimensions = imageSize(new Uint8Array(imageData));
            const maxWidth = 500; // max width in docx points
            let width = dimensions.width || 400;
            let height = dimensions.height || 300;

            if (width > maxWidth) {
              const scale = maxWidth / width;
              width = maxWidth;
              height = Math.round(height * scale);
            }

            children.push(new Paragraph({
              children: [new ImageRun({
                data: imageData,
                transformation: { width, height },
                type: 'jpg',
              })],
              spacing: { after: 200 },
            }));
          } catch {
            children.push(new Paragraph({
              children: [new TextRun({ text: '[图片加载失败]', italics: true, color: '999999' })],
              spacing: { after: 200 },
            }));
          }
        }
      }

      // OCR text
      if (q.ocr_text) {
        children.push(new Paragraph({
          children: [new TextRun({ text: '题目原文:', bold: true, size: 22 })],
          spacing: { before: 100 },
        }));

        // Split OCR text by lines
        for (const line of q.ocr_text.split('\n')) {
          children.push(new Paragraph({
            children: [new TextRun({ text: line, size: 21 })],
          }));
        }
      }

      // Answer
      if (q.ai_answer) {
        children.push(new Paragraph({
          children: [new TextRun({ text: '答案:', bold: true, size: 22 })],
          spacing: { before: 200 },
        }));
        children.push(new Paragraph({
          children: [new TextRun({ text: q.ai_answer, size: 21 })],
          spacing: { after: 100 },
        }));
      }

      // Solution
      if (q.ai_solution) {
        children.push(new Paragraph({
          children: [new TextRun({ text: '解题思路:', bold: true, size: 22 })],
          spacing: { before: 100 },
        }));
        for (const line of q.ai_solution.split('\n')) {
          children.push(new Paragraph({
            children: [new TextRun({ text: line, size: 21 })],
          }));
        }
      }
    }

    const doc = new Document({
      sections: [{ children }],
    });

    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="question-bank-export.docx"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: `导出失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    );
  }
}
