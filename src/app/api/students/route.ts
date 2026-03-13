import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { calcGraduationYear, getCurrentGrade } from '@/lib/utils';

export async function GET() {
  const db = getDb();
  const students = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM questions q WHERE q.student_id = s.id) as question_count
    FROM students s
    ORDER BY s.created_at DESC
  `).all() as (Record<string, unknown> & { initial_grade: number; enrollment_year: number; graduation_year: number })[];

  const result = students.map(s => ({
    ...s,
    current_grade: getCurrentGrade(s.initial_grade, s.enrollment_year, s.graduation_year),
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, school, initial_grade, enrollment_year } = body;

  if (!name || !initial_grade || !enrollment_year) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
  }

  const db = getDb();
  const graduation_year = calcGraduationYear(initial_grade, enrollment_year);

  const result = db.prepare(`
    INSERT INTO students (name, school, initial_grade, enrollment_year, graduation_year)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, school || '', initial_grade, enrollment_year, graduation_year);

  return NextResponse.json({ id: result.lastInsertRowid, message: '学生创建成功' });
}
