/**
 * Calculate current grade based on enrollment info.
 * Returns "已毕业" if past graduation year.
 */
export function getCurrentGrade(
  initialGrade: number,
  enrollmentYear: number,
  graduationYear: number
): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  // Academic year starts in September
  const academicYear = currentMonth >= 9 ? currentYear : currentYear - 1;

  if (academicYear >= graduationYear) {
    return '已毕业';
  }

  const yearsPassed = academicYear - enrollmentYear;
  const currentGradeNum = initialGrade + yearsPassed;

  if (currentGradeNum > 3) return '已毕业';
  if (currentGradeNum < 1) return '高一';

  const gradeNames: Record<number, string> = { 1: '高一', 2: '高二', 3: '高三' };
  return gradeNames[currentGradeNum] || '已毕业';
}

/**
 * Calculate graduation year from initial grade and enrollment year.
 */
export function calcGraduationYear(initialGrade: number, enrollmentYear: number): number {
  // If entering as 高一(1), graduates in enrollmentYear + 3
  // If entering as 高二(2), graduates in enrollmentYear + 2
  // If entering as 高三(3), graduates in enrollmentYear + 1
  return enrollmentYear + (4 - initialGrade);
}

/**
 * Get mastery color based on confirmed count.
 */
export function getMasteryColor(confirmedCount: number): 'none' | 'red' | 'yellow' | 'green' {
  if (confirmedCount <= 0) return 'none';
  if (confirmedCount === 1) return 'red';
  if (confirmedCount === 2) return 'yellow';
  return 'green';
}

/**
 * Parse difficulty stars string to number.
 */
export function parseDifficulty(stars: string): number {
  if (!stars) return 3;
  return (stars.match(/★/g) || []).length || 3;
}

/**
 * Render difficulty as stars string.
 */
export function renderStars(difficulty: number): string {
  return '★'.repeat(difficulty) + '☆'.repeat(5 - difficulty);
}

/**
 * Extract tag type from level3 text.
 * e.g. "【必备知识】匀速直线运动" -> "必备知识"
 */
export function extractTagType(level3: string): string {
  const match = level3.match(/【(.+?)】/);
  return match ? match[1] : '';
}

/**
 * Format date string for display.
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
