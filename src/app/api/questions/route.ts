import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get('studentId');

  const db = getDb();

  let questions;
  if (studentId) {
    questions = db.prepare(`
      SELECT q.*,
        s.name as student_name,
        json_group_array(json_object(
          'id', qkp.id,
          'seq', qkp.knowledge_point_seq,
          'confirmed', qkp.confirmed_mastered,
          'level3', kp.level3
        )) as knowledge_points
      FROM questions q
      JOIN students s ON s.id = q.student_id
      LEFT JOIN question_knowledge_points qkp ON qkp.question_id = q.id
      LEFT JOIN knowledge_points kp ON kp.seq_number = qkp.knowledge_point_seq
      WHERE q.student_id = ?
      GROUP BY q.id
      ORDER BY q.created_at DESC
    `).all(Number(studentId));
  } else {
    questions = db.prepare(`
      SELECT q.*,
        s.name as student_name,
        json_group_array(json_object(
          'id', qkp.id,
          'seq', qkp.knowledge_point_seq,
          'confirmed', qkp.confirmed_mastered,
          'level3', kp.level3
        )) as knowledge_points
      FROM questions q
      JOIN students s ON s.id = q.student_id
      LEFT JOIN question_knowledge_points qkp ON qkp.question_id = q.id
      LEFT JOIN knowledge_points kp ON kp.seq_number = qkp.knowledge_point_seq
      GROUP BY q.id
      ORDER BY q.created_at DESC
      LIMIT 100
    `).all();
  }

  const parsed = (questions as Record<string, unknown>[]).map(q => ({
    ...q,
    knowledge_points: JSON.parse(q.knowledge_points as string).filter((kp: Record<string, unknown>) => kp.seq !== null),
  }));

  return NextResponse.json(parsed);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { student_id, image_path, ai_solution, ai_answer, ocr_text, error_reason, knowledge_point_seqs } = body;

  if (!student_id || !image_path) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
  }

  const db = getDb();

  const insertQuestion = db.prepare(`
    INSERT INTO questions (student_id, image_path, ai_solution, ai_answer, ocr_text, error_reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertKp = db.prepare(`
    INSERT INTO question_knowledge_points (question_id, knowledge_point_seq)
    VALUES (?, ?)
  `);

  const result = db.transaction(() => {
    const qResult = insertQuestion.run(student_id, image_path, ai_solution || '', ai_answer || '', ocr_text || '', error_reason || '');
    const questionId = qResult.lastInsertRowid;

    if (Array.isArray(knowledge_point_seqs)) {
      for (const seq of knowledge_point_seqs) {
        insertKp.run(questionId, seq);
      }
    }

    return questionId;
  })();

  return NextResponse.json({ id: result, message: '题目保存成功' });
}
