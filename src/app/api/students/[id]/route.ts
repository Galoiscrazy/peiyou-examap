import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentGrade, calcGraduationYear } from '@/lib/utils';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(Number(id)) as Record<string, unknown> & { initial_grade: number; enrollment_year: number; graduation_year: number } | undefined;

  if (!student) {
    return NextResponse.json({ error: '学生不存在' }, { status: 404 });
  }

  const questions = db.prepare(`
    SELECT q.*,
      json_group_array(json_object(
        'id', qkp.id,
        'seq', qkp.knowledge_point_seq,
        'confirmed', qkp.confirmed_mastered,
        'level3', kp.level3,
        'level1', kp.level1,
        'level2', kp.level2,
        'difficulty', kp.difficulty
      )) as knowledge_points
    FROM questions q
    LEFT JOIN question_knowledge_points qkp ON qkp.question_id = q.id
    LEFT JOIN knowledge_points kp ON kp.seq_number = qkp.knowledge_point_seq
    WHERE q.student_id = ?
    GROUP BY q.id
    ORDER BY q.created_at DESC
  `).all(Number(id));

  // Parse JSON strings
  const parsedQuestions = (questions as Record<string, unknown>[]).map(q => ({
    ...q,
    knowledge_points: JSON.parse(q.knowledge_points as string).filter((kp: Record<string, unknown>) => kp.seq !== null),
  }));

  // Get mastery data for each knowledge point
  const masteryData = db.prepare(`
    SELECT kp.seq_number, kp.level1, kp.level2, kp.level3, kp.difficulty, kp.tag_type,
      COUNT(CASE WHEN qkp.confirmed_mastered = 1 THEN 1 END) as confirmed_count,
      COUNT(qkp.id) as total_asked
    FROM knowledge_points kp
    LEFT JOIN question_knowledge_points qkp ON qkp.knowledge_point_seq = kp.seq_number
    LEFT JOIN questions q ON q.id = qkp.question_id AND q.student_id = ?
    GROUP BY kp.seq_number
    ORDER BY kp.seq_number
  `).all(Number(id));

  return NextResponse.json({
    ...student,
    current_grade: getCurrentGrade(student.initial_grade, student.enrollment_year, student.graduation_year),
    questions: parsedQuestions,
    mastery: masteryData,
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { name, school, initial_grade, enrollment_year } = body;

  const db = getDb();

  if (initial_grade !== undefined && enrollment_year !== undefined) {
    const graduation_year = calcGraduationYear(initial_grade, enrollment_year);
    db.prepare(
      'UPDATE students SET name = ?, school = ?, initial_grade = ?, enrollment_year = ?, graduation_year = ? WHERE id = ?'
    ).run(name, school || '', initial_grade, enrollment_year, graduation_year, Number(id));
  } else {
    db.prepare('UPDATE students SET name = ?, school = ? WHERE id = ?').run(name, school || '', Number(id));
  }

  return NextResponse.json({ message: '更新成功' });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM students WHERE id = ?').run(Number(id));
  return NextResponse.json({ message: '删除成功' });
}
