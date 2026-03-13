import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentGrade } from '@/lib/utils';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const classInfo = db.prepare('SELECT * FROM classes WHERE id = ?').get(Number(id));
  if (!classInfo) {
    return NextResponse.json({ error: '班级不存在' }, { status: 404 });
  }

  const students = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM questions q WHERE q.student_id = s.id) as question_count
    FROM students s
    JOIN class_students cs ON cs.student_id = s.id AND cs.class_id = ?
    ORDER BY s.name
  `).all(Number(id)) as (Record<string, unknown> & { initial_grade: number; enrollment_year: number; graduation_year: number })[];

  const studentsWithGrade = students.map(s => ({
    ...s,
    current_grade: getCurrentGrade(s.initial_grade, s.enrollment_year, s.graduation_year),
  }));

  return NextResponse.json({ ...classInfo, students: studentsWithGrade });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { name, description, student_ids } = body;

  const db = getDb();
  db.transaction(() => {
    if (name !== undefined) {
      db.prepare('UPDATE classes SET name = ?, description = ? WHERE id = ?').run(name, description || '', Number(id));
    }

    if (Array.isArray(student_ids)) {
      db.prepare('DELETE FROM class_students WHERE class_id = ?').run(Number(id));
      const insertCs = db.prepare('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)');
      for (const sid of student_ids) {
        insertCs.run(Number(id), sid);
      }
    }
  })();

  return NextResponse.json({ message: '更新成功' });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM classes WHERE id = ?').run(Number(id));
  return NextResponse.json({ message: '删除成功' });
}
