import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';

export async function GET() {
  try {
    const db = getDb();

    // Query all user data (NOT knowledge_points — those are preset base data)
    const students = db.prepare('SELECT * FROM students').all();
    const classes = db.prepare('SELECT * FROM classes').all();
    const classStudents = db.prepare('SELECT * FROM class_students').all();
    const questions = db.prepare('SELECT * FROM questions').all();
    const questionKps = db.prepare('SELECT * FROM question_knowledge_points').all();

    // Read all uploaded images as base64
    const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    const images: Record<string, string> = {};

    if (existsSync(uploadsDir)) {
      const files = readdirSync(uploadsDir);
      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        try {
          const data = readFileSync(filePath);
          const ext = path.extname(file).toLowerCase().replace('.', '') || 'jpeg';
          const mimeType = ext === 'jpg' ? 'jpeg' : ext;
          images[file] = `data:image/${mimeType};base64,${data.toString('base64')}`;
        } catch {
          // Skip unreadable files
        }
      }
    }

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: {
        students,
        classes,
        class_students: classStudents,
        questions,
        question_knowledge_points: questionKps,
      },
      images,
    };

    const jsonString = JSON.stringify(exportData, null, 2);

    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="backup_${formatDate()}.json"`,
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

function formatDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
