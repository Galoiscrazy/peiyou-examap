import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const classId = Number(id);
  const db = getDb();

  // Get student IDs in this class
  const studentIds = db.prepare('SELECT student_id FROM class_students WHERE class_id = ?')
    .all(classId)
    .map((r: unknown) => (r as { student_id: number }).student_id);

  if (studentIds.length === 0) {
    return NextResponse.json({
      heatmap: [],
      byLevel1: [],
      byDifficulty: [],
      topKnowledgePoints: [],
      studentCount: 0,
    });
  }

  const placeholders = studentIds.map(() => '?').join(',');

  // Heatmap: each KP with ask frequency across class students
  const heatmap = db.prepare(`
    SELECT kp.seq_number, kp.level1, kp.level2, kp.level3, kp.difficulty, kp.tag_type,
      COUNT(DISTINCT q.student_id) as student_count,
      COUNT(qkp.id) as total_asks,
      COUNT(CASE WHEN qkp.confirmed_mastered = 1 THEN 1 END) as confirmed_count
    FROM knowledge_points kp
    LEFT JOIN question_knowledge_points qkp ON qkp.knowledge_point_seq = kp.seq_number
    LEFT JOIN questions q ON q.id = qkp.question_id AND q.student_id IN (${placeholders})
    GROUP BY kp.seq_number
    ORDER BY kp.seq_number
  `).all(...studentIds);

  // By level1
  const byLevel1 = db.prepare(`
    SELECT kp.level1, COUNT(DISTINCT qkp.knowledge_point_seq) as kp_count, COUNT(qkp.id) as ask_count
    FROM question_knowledge_points qkp
    JOIN questions q ON q.id = qkp.question_id AND q.student_id IN (${placeholders})
    JOIN knowledge_points kp ON kp.seq_number = qkp.knowledge_point_seq
    GROUP BY kp.level1
    ORDER BY ask_count DESC
  `).all(...studentIds);

  // By difficulty
  const byDifficulty = db.prepare(`
    SELECT kp.difficulty, COUNT(qkp.id) as count
    FROM question_knowledge_points qkp
    JOIN questions q ON q.id = qkp.question_id AND q.student_id IN (${placeholders})
    JOIN knowledge_points kp ON kp.seq_number = qkp.knowledge_point_seq
    GROUP BY kp.difficulty
    ORDER BY kp.difficulty
  `).all(...studentIds);

  // Top 20 most asked knowledge points
  const topKnowledgePoints = db.prepare(`
    SELECT kp.seq_number, kp.level3, kp.level1, kp.difficulty,
      COUNT(qkp.id) as ask_count,
      COUNT(DISTINCT q.student_id) as student_count
    FROM question_knowledge_points qkp
    JOIN questions q ON q.id = qkp.question_id AND q.student_id IN (${placeholders})
    JOIN knowledge_points kp ON kp.seq_number = qkp.knowledge_point_seq
    GROUP BY kp.seq_number
    ORDER BY ask_count DESC
    LIMIT 20
  `).all(...studentIds);

  return NextResponse.json({
    heatmap,
    byLevel1,
    byDifficulty,
    topKnowledgePoints,
    studentCount: studentIds.length,
  });
}
