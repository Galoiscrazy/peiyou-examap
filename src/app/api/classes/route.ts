import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const classes = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id) as student_count
    FROM classes c
    ORDER BY c.created_at DESC
  `).all();

  return NextResponse.json(classes);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description, student_ids } = body;

  if (!name) {
    return NextResponse.json({ error: '请输入班级名称' }, { status: 400 });
  }

  const db = getDb();
  const result = db.transaction(() => {
    const r = db.prepare('INSERT INTO classes (name, description) VALUES (?, ?)').run(name, description || '');
    const classId = r.lastInsertRowid;

    if (Array.isArray(student_ids)) {
      const insertCs = db.prepare('INSERT OR IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)');
      for (const sid of student_ids) {
        insertCs.run(classId, sid);
      }
    }

    return classId;
  })();

  return NextResponse.json({ id: result, message: '班级创建成功' });
}
