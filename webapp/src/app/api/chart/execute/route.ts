import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Dynamic import at runtime
let Executor: any = null;

async function getExecutor() {
  if (!Executor) {
    const module = await import('redpill');
    Executor = module.Executor;
  }
  return Executor;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { data, spec } = body;

    if (!data || !spec) {
      return NextResponse.json(
        { error: 'Missing data or spec' },
        { status: 400 }
      );
    }

    const ExecutorClass = await getExecutor();
    const executor = new ExecutorClass();
    
    const result = executor.execute(spec, data);

    return NextResponse.json({
      chartData: result.data,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
