import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const kpSeqs = searchParams.get('kp_seqs'); // comma-separated
  const search = searchParams.get('search') || '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize')) || 20));

  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (kpSeqs) {
    const seqs = kpSeqs.split(',').map(Number).filter(n => !isNaN(n));
    if (seqs.length > 0) {
      conditions.push(`q.id IN (SELECT question_id FROM question_knowledge_points WHERE knowledge_point_seq IN (${seqs.map(() => '?').join(',')}))`);
      params.push(...seqs);
    }
  }

  if (search) {
    conditions.push('(q.ocr_text LIKE ? OR q.ai_answer LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countRow = db.prepare(`SELECT COUNT(DISTINCT q.id) as total FROM questions q ${whereClause}`).get(...params) as { total: number };
  const total = countRow.total;

  // Fetch page
  const offset = (page - 1) * pageSize;
  const questions = db.prepare(`
    SELECT q.*, s.name as student_name,
      json_group_array(json_object(
        'seq', qkp.knowledge_point_seq,
        'level3', kp.level3,
        'level1', kp.level1,
        'level2', kp.level2,
        'difficulty', kp.difficulty
      )) as knowledge_points
    FROM questions q
    JOIN students s ON s.id = q.student_id
    LEFT JOIN question_knowledge_points qkp ON qkp.question_id = q.id
    LEFT JOIN knowledge_points kp ON kp.seq_number = qkp.knowledge_point_seq
    ${whereClause}
    GROUP BY q.id
    ORDER BY q.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  const parsed = (questions as Record<string, unknown>[]).map(q => ({
    ...q,
    knowledge_points: JSON.parse(q.knowledge_points as string).filter((kp: Record<string, unknown>) => kp.seq !== null),
  }));

  return NextResponse.json({ questions: parsed, total, page, pageSize });
}
