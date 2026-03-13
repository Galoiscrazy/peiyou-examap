import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { readdirSync, existsSync } from 'fs';
import path from 'path';

export async function GET() {
  try {
    const db = getDb();

    const studentCount = (db.prepare('SELECT COUNT(*) as count FROM students').get() as { count: number }).count;
    const classCount = (db.prepare('SELECT COUNT(*) as count FROM classes').get() as { count: number }).count;
    const questionCount = (db.prepare('SELECT COUNT(*) as count FROM questions').get() as { count: number }).count;
    const kpLinkCount = (db.prepare('SELECT COUNT(*) as count FROM question_knowledge_points').get() as { count: number }).count;

    const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    let imageCount = 0;
    if (existsSync(uploadsDir)) {
      imageCount = readdirSync(uploadsDir).length;
    }

    return NextResponse.json({
      students: studentCount,
      classes: classCount,
      questions: questionCount,
      knowledgePointLinks: kpLinkCount,
      images: imageCount,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: `获取统计失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    );
  }
}
