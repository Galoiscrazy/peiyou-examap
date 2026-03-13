import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { confirmed_mastered } = body;

  const db = getDb();
  db.prepare(`
    UPDATE question_knowledge_points
    SET confirmed_mastered = ?
    WHERE id = ?
  `).run(confirmed_mastered ? 1 : 0, Number(id));

  return NextResponse.json({ message: '更新成功' });
}
