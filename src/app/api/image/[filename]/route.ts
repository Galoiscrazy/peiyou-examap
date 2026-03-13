import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const filepath = path.join(process.cwd(), 'data', 'uploads', filename);

  try {
    const buffer = await readFile(filepath);
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    const contentType = mimeMap[ext] || 'image/png';

    return new NextResponse(buffer, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000' },
    });
  } catch {
    return NextResponse.json({ error: '图片不存在' }, { status: 404 });
  }
}
