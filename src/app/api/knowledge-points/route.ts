import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const withHeat = searchParams.get('withHeat') === 'true';

  const db = getDb();

  if (withHeat) {
    // Include heat data: how many students asked about each KP
    const rows = db.prepare(`
      SELECT kp.*,
        COUNT(DISTINCT q.student_id) as student_count,
        COUNT(qkp.id) as ask_count
      FROM knowledge_points kp
      LEFT JOIN question_knowledge_points qkp ON qkp.knowledge_point_seq = kp.seq_number
      LEFT JOIN questions q ON q.id = qkp.question_id
      GROUP BY kp.seq_number
      ORDER BY kp.seq_number
    `).all();
    return NextResponse.json(rows);
  }

  const rows = db.prepare('SELECT * FROM knowledge_points ORDER BY seq_number').all();
  return NextResponse.json(rows);
}
