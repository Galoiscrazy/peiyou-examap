/**
 * Import knowledge points from the Excel file into SQLite.
 * Run with: node data/import-excel.mjs
 */
import Database from 'better-sqlite3';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'physics.db');
const EXCEL_PATH = path.join(__dirname, '..', '【物理】考点地图-终版.xlsx');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
}

console.log('Reading Excel file:', EXCEL_PATH);
const workbook = XLSX.readFile(EXCEL_PATH);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convert to array of arrays
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log(`Found ${data.length} rows (including header)`);

// Open database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create table
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

// Clear existing knowledge points
db.exec('DELETE FROM knowledge_points');

// Prepare insert statement
const insert = db.prepare(`
  INSERT INTO knowledge_points (seq_number, level1, level2, level3, difficulty, prerequisites, tag_type, special_note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Parse difficulty stars to number
function parseDifficulty(stars) {
  if (!stars) return 3;
  const count = (String(stars).match(/★/g) || []).length;
  return count || 3;
}

// Extract tag type from level3 text
function extractTagType(text) {
  if (!text) return '';
  const match = String(text).match(/【(.+?)】/);
  return match ? match[1] : '';
}

// Process rows (skip header row)
let currentLevel1 = '';
let currentLevel2 = '';
let imported = 0;

const insertMany = db.transaction(() => {
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    // Column A: level1 (only filled when changed)
    if (row[0] && String(row[0]).trim()) {
      currentLevel1 = String(row[0]).trim();
    }

    // Column B: level2 (only filled when changed)
    if (row[1] && String(row[1]).trim()) {
      currentLevel2 = String(row[1]).trim();
    }

    // Column C: level3 (always filled)
    const level3 = row[2] ? String(row[2]).trim() : '';
    if (!level3) continue;

    // Column D: sequence number
    const seqNumber = parseInt(row[3]);
    if (isNaN(seqNumber)) continue;

    // Column E: difficulty
    const difficulty = parseDifficulty(row[4]);

    // Column F: prerequisites
    const prerequisites = row[5] ? String(row[5]).trim() : '';

    // Column G: special note
    const specialNote = row[6] ? String(row[6]).trim() : '';

    // Extract tag type from level3
    const tagType = extractTagType(level3);

    try {
      insert.run(seqNumber, currentLevel1, currentLevel2, level3, difficulty, prerequisites, tagType, specialNote);
      imported++;
    } catch (err) {
      console.error(`Error importing row ${i} (seq ${seqNumber}):`, err.message);
    }
  }
});

insertMany();

console.log(`Successfully imported ${imported} knowledge points.`);

// Verify
const count = db.prepare('SELECT COUNT(*) as cnt FROM knowledge_points').get();
console.log(`Database now has ${count.cnt} knowledge points.`);

// Show some stats
const diffStats = db.prepare(`
  SELECT difficulty, COUNT(*) as cnt
  FROM knowledge_points
  GROUP BY difficulty
  ORDER BY difficulty
`).all();
console.log('\nDifficulty distribution:');
diffStats.forEach(s => console.log(`  ${'★'.repeat(s.difficulty)}: ${s.cnt}`));

const level1Stats = db.prepare(`
  SELECT level1, COUNT(*) as cnt
  FROM knowledge_points
  GROUP BY level1
  ORDER BY MIN(seq_number)
`).all();
console.log(`\nLevel 1 chapters: ${level1Stats.length}`);
level1Stats.forEach(s => console.log(`  ${s.level1}: ${s.cnt} points`));

db.close();
console.log('\nDone! Database saved to:', DB_PATH);
