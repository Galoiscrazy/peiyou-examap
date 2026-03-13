import { NextRequest } from 'next/server';
import { analyzeQuestionWithFile } from '@/lib/claude';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { image_path } = body;

  if (!image_path) {
    return new Response(
      JSON.stringify({ error: '请提供图片路径' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send('progress', { step: 'start', message: '正在准备分析...', percent: 5 });

        const result = await analyzeQuestionWithFile(image_path, (message, percent) => {
          send('progress', { step: 'analyzing', message, percent });
        });

        send('progress', { step: 'done', message: '分析完成！', percent: 100 });
        send('result', result);
      } catch (error) {
        console.error('AI analysis error:', error);
        send('error', { message: error instanceof Error ? error.message : '未知错误' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
