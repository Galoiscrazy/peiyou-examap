import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'physics.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables(db);
  }
  return db;
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seq_number INTEGER UNIQUE NOT NULL,
      level1 TEXT NOT NULL,
      level2 TEXT NOT NULL,
      level3 TEXT NOT NULL,
      difficulty INTEGER NOT NULL DEFAULT 3,
      prerequisites TEXT DEFAULT '',
      tag_type TEXT DEFAULT '',
      special_note TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      wechat_id TEXT DEFAULT '',
      student_code TEXT DEFAULT '',
      school TEXT DEFAULT '',
      initial_grade INTEGER NOT NULL DEFAULT 1,
      enrollment_year INTEGER NOT NULL,
      graduation_year INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      ai_solution TEXT DEFAULT '',
      ai_answer TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS question_knowledge_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      knowledge_point_seq INTEGER NOT NULL,
      confirmed_mastered INTEGER DEFAULT 0,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
      FOREIGN KEY (knowledge_point_seq) REFERENCES knowledge_points(seq_number)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS class_students (
      class_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      PRIMARY KEY (class_id, student_id),
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_questions_student ON questions(student_id);
    CREATE INDEX IF NOT EXISTS idx_qkp_question ON question_knowledge_points(question_id);
    CREATE INDEX IF NOT EXISTS idx_qkp_kp ON question_knowledge_points(knowledge_point_seq);
    CREATE INDEX IF NOT EXISTS idx_class_students_class ON class_students(class_id);
    CREATE INDEX IF NOT EXISTS idx_class_students_student ON class_students(student_id);
  `);

  // Migration: add new columns (safe to re-run)
  try { db.exec('ALTER TABLE questions ADD COLUMN ocr_text TEXT DEFAULT ""'); } catch {}
  try { db.exec('ALTER TABLE questions ADD COLUMN error_reason TEXT DEFAULT ""'); } catch {}
  try { db.exec('ALTER TABLE students ADD COLUMN wechat_id TEXT DEFAULT ""'); } catch {}
  try { db.exec('ALTER TABLE students ADD COLUMN student_code TEXT DEFAULT ""'); } catch {}
}
