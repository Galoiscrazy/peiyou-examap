import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const studentId = Number(id);
  const db = getDb();

  // Knowledge points asked by this student grouped by level1
  const byLevel1 = db.prepare(`
    SELECT kp.level1, COUNT(DISTINCT qkp.knowledge_point_seq) as kp_count, COUNT(qkp.id) as ask_count
    FROM question_knowledge_points qkp
    JOIN questions q ON q.id = qkp.question_id AND q.student_id = ?
    JOIN knowledge_points kp ON kp.seq_number = qkp.knowledge_point_seq
    GROUP BY kp.level1
    ORDER BY ask_count DESC
  `).all(studentId);

  // Difficulty distribution
  const byDifficulty = db.prepare(`
    SELECT kp.difficulty, COUNT(qkp.id) as count
    FROM question_knowledge_points qkp
    JOIN questions q ON q.id = qkp.question_id AND q.student_id = ?
    JOIN knowledge_points kp ON kp.seq_number = qkp.knowledge_point_seq
    GROUP BY kp.difficulty
    ORDER BY kp.difficulty
  `).all(studentId);

  // Total stats
  const totalQuestions = db.prepare('SELECT COUNT(*) as cnt FROM questions WHERE student_id = ?').get(studentId) as { cnt: number };
  const totalKps = db.prepare(`
    SELECT COUNT(DISTINCT qkp.knowledge_point_seq) as cnt
    FROM question_knowledge_points qkp
    JOIN questions q ON q.id = qkp.question_id AND q.student_id = ?
  `).get(studentId) as { cnt: number };
  const allKps = db.prepare('SELECT COUNT(*) as cnt FROM knowledge_points').get() as { cnt: number };

  return NextResponse.json({
    byLevel1,
    byDifficulty,
    totalQuestions: totalQuestions.cnt,
    totalKnowledgePoints: totalKps.cnt,
    allKnowledgePoints: allKps.cnt,
    coveragePercent: allKps.cnt > 0 ? Math.round((totalKps.cnt / allKps.cnt) * 100) : 0,
  });
}
