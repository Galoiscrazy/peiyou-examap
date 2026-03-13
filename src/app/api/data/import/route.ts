import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

interface ImportData {
  version: string;
  exportDate: string;
  data: {
    students: Record<string, unknown>[];
    classes: Record<string, unknown>[];
    class_students: Record<string, unknown>[];
    questions: Record<string, unknown>[];
    question_knowledge_points: Record<string, unknown>[];
  };
  images: Record<string, string>;
}

export async function POST(request: NextRequest) {
  try {
    const body: ImportData = await request.json();

    // Validate structure
    if (!body.version || !body.data) {
      return NextResponse.json({ error: '无效的备份文件格式' }, { status: 400 });
    }

    if (!body.data.students || !body.data.questions) {
      return NextResponse.json({ error: '备份文件缺少必要数据' }, { status: 400 });
    }

    const db = getDb();

    // Run everything in a transaction
    const importTransaction = db.transaction(() => {
      // 1. Clear existing user data (order matters for foreign keys)
      db.prepare('DELETE FROM question_knowledge_points').run();
      db.prepare('DELETE FROM questions').run();
      db.prepare('DELETE FROM class_students').run();
      db.prepare('DELETE FROM classes').run();
      db.prepare('DELETE FROM students').run();

      // 2. Import students
      const insertStudent = db.prepare(
        'INSERT INTO students (id, name, school, initial_grade, enrollment_year, graduation_year, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const s of body.data.students) {
        insertStudent.run(
          s.id, s.name, s.school || '',
          s.initial_grade || 1, s.enrollment_year, s.graduation_year,
          s.created_at || new Date().toISOString()
        );
      }

      // 3. Import classes
      const insertClass = db.prepare(
        'INSERT INTO classes (id, name, description, created_at) VALUES (?, ?, ?, ?)'
      );
      for (const c of body.data.classes || []) {
        insertClass.run(
          c.id, c.name, c.description || '',
          c.created_at || new Date().toISOString()
        );
      }

      // 4. Import class_students
      const insertClassStudent = db.prepare(
        'INSERT INTO class_students (class_id, student_id) VALUES (?, ?)'
      );
      for (const cs of body.data.class_students || []) {
        insertClassStudent.run(cs.class_id, cs.student_id);
      }

      // 5. Import questions
      const insertQuestion = db.prepare(
        'INSERT INTO questions (id, student_id, image_path, ai_solution, ai_answer, ocr_text, error_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const q of body.data.questions) {
        insertQuestion.run(
          q.id, q.student_id, q.image_path || '',
          q.ai_solution || '', q.ai_answer || '',
          q.ocr_text || '', q.error_reason || '',
          q.created_at || new Date().toISOString()
        );
      }

      // 6. Import question_knowledge_points
      const insertQkp = db.prepare(
        'INSERT INTO question_knowledge_points (id, question_id, knowledge_point_seq, confirmed_mastered) VALUES (?, ?, ?, ?)'
      );
      for (const qkp of body.data.question_knowledge_points || []) {
        insertQkp.run(
          qkp.id, qkp.question_id, qkp.knowledge_point_seq,
          qkp.confirmed_mastered || 0
        );
      }
    });

    importTransaction();

    // 7. Write images to uploads directory
    const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }

    let imageCount = 0;
    if (body.images) {
      for (const [filename, dataUrl] of Object.entries(body.images)) {
        try {
          // Extract base64 data from data URL
          const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
          if (base64Match) {
            const buffer = Buffer.from(base64Match[1], 'base64');
            writeFileSync(path.join(uploadsDir, filename), buffer);
            imageCount++;
          }
        } catch {
          // Skip problematic images
        }
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        students: body.data.students.length,
        classes: (body.data.classes || []).length,
        questions: body.data.questions.length,
        knowledgePointLinks: (body.data.question_knowledge_points || []).length,
        images: imageCount,
      },
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: `导入失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    );
  }
}
