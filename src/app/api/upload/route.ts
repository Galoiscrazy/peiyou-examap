import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: '请上传文件' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Create uploads directory if needed
  const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
  await mkdir(uploadsDir, { recursive: true });

  // Generate unique filename
  const timestamp = Date.now();
  const ext = path.extname(file.name) || '.png';
  const filename = `question_${timestamp}${ext}`;
  const filepath = path.join(uploadsDir, filename);

  await writeFile(filepath, buffer);

  return NextResponse.json({
    path: filepath,
    filename,
    url: `/api/image/${filename}`,
  });
}
