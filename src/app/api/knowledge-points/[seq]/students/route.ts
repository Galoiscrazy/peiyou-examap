import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ seq: string }> }) {
  const { seq } = await params;
  const db = getDb();

  const students = db.prepare(`
    SELECT s.id, s.name, s.school,
      COUNT(qkp.id) as ask_count,
      COUNT(CASE WHEN qkp.confirmed_mastered = 1 THEN 1 END) as confirmed_count
    FROM students s
    JOIN questions q ON q.student_id = s.id
    JOIN question_knowledge_points qkp ON qkp.question_id = q.id AND qkp.knowledge_point_seq = ?
    GROUP BY s.id
    ORDER BY ask_count DESC
  `).all(Number(seq));

  return NextResponse.json(students);
}
