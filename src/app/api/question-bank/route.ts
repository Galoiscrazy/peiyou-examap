import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const kpSeqStr = searchParams.get('kp_seq') || '';
  const search = searchParams.get('search') || '';
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') || '20')));

  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // Knowledge point filter
  if (kpSeqStr) {
    const seqs = kpSeqStr.split(',').map(Number).filter(n => !isNaN(n));
    if (seqs.length > 0) {
      const placeholders = seqs.map(() => '?').join(',');
      conditions.push(`q.id IN (SELECT DISTINCT question_id FROM question_knowledge_points WHERE knowledge_point_seq IN (${placeholders}))`);
      params.push(...seqs);
    }
  }

  // Text search on ocr_text
  if (search) {
    conditions.push(`q.ocr_text LIKE '%' || ? || '%'`);
    params.push(search);
  }

  // Only show questions that have OCR text
  conditions.push(`q.ocr_text != ''`);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countSql = `SELECT COUNT(DISTINCT q.id) as total FROM questions q ${whereClause}`;
  const { total } = db.prepare(countSql).get(...params) as { total: number };

  // Fetch questions with knowledge points
  const offset = (page - 1) * pageSize;
  const querySql = `
    SELECT q.*, s.name as student_name,
      json_group_array(json_object(
        'seq', qkp.knowledge_point_seq,
        'level1', kp.level1,
        'level2', kp.level2,
        'level3', kp.level3,
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
  `;

  const questions = db.prepare(querySql).all(...params, pageSize, offset) as Record<string, unknown>[];

  const parsed = questions.map(q => ({
    ...q,
    knowledge_points: JSON.parse(q.knowledge_points as string).filter((kp: Record<string, unknown>) => kp.seq !== null),
  }));

  return NextResponse.json({ questions: parsed, total, page, pageSize });
}
