import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const question = db.prepare(`
    SELECT q.*, s.name as student_name, s.id as student_id
    FROM questions q
    JOIN students s ON s.id = q.student_id
    WHERE q.id = ?
  `).get(Number(id));

  if (!question) {
    return NextResponse.json({ error: '题目不存在' }, { status: 404 });
  }

  const knowledgePoints = db.prepare(`
    SELECT qkp.*, kp.level1, kp.level2, kp.level3, kp.difficulty, kp.tag_type
    FROM question_knowledge_points qkp
    JOIN knowledge_points kp ON kp.seq_number = qkp.knowledge_point_seq
    WHERE qkp.question_id = ?
  `).all(Number(id));

  return NextResponse.json({
    ...question,
    knowledge_points: knowledgePoints,
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { ai_solution, ai_answer, ocr_text, error_reason, knowledge_point_seqs } = body;

  const db = getDb();

  db.transaction(() => {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (ai_solution !== undefined) { updates.push('ai_solution = ?'); values.push(ai_solution); }
    if (ai_answer !== undefined) { updates.push('ai_answer = ?'); values.push(ai_answer); }
    if (ocr_text !== undefined) { updates.push('ocr_text = ?'); values.push(ocr_text); }
    if (error_reason !== undefined) { updates.push('error_reason = ?'); values.push(error_reason); }

    if (updates.length > 0) {
      values.push(Number(id));
      db.prepare(`UPDATE questions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    if (Array.isArray(knowledge_point_seqs)) {
      db.prepare('DELETE FROM question_knowledge_points WHERE question_id = ?').run(Number(id));
      const insertKp = db.prepare('INSERT INTO question_knowledge_points (question_id, knowledge_point_seq) VALUES (?, ?)');
      for (const seq of knowledge_point_seqs) {
        insertKp.run(Number(id), seq);
      }
    }
  })();

  return NextResponse.json({ message: '更新成功' });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  // Get image path before deleting
  const question = db.prepare('SELECT image_path FROM questions WHERE id = ?').get(Number(id)) as { image_path: string } | undefined;

  db.prepare('DELETE FROM questions WHERE id = ?').run(Number(id));

  // Delete image file
  if (question?.image_path) {
    const filename = question.image_path.split(/[\\/]/).pop();
    if (filename) {
      const filePath = path.join(process.cwd(), 'data', 'uploads', filename);
      if (existsSync(filePath)) {
        try { unlinkSync(filePath); } catch {}
      }
    }
  }

  return NextResponse.json({ message: '删除成功' });
}
