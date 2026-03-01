import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';

// Dynamic import at runtime
let Redpill: any = null;

async function getRedpill() {
  if (!Redpill) {
    const module = await import('redpill');
    Redpill = module.Redpill;
  }
  return Redpill;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { data, prompt } = body;

    if (!data || !prompt) {
      return NextResponse.json(
        { error: 'Missing data or prompt' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY not configured' },
        { status: 500 }
      );
    }

    // OpenAI client via OpenRouter
    const client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });

    // Your LLM function - full control over model, temperature, etc.
    const llmFunction = async (messages: any[], options?: any) => {
      try {
        const response = await client.chat.completions.create({
          model: 'liquid/lfm-2.5-1.2b-thinking:free', // Your model choice
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4000,
        });

        console.log('LLM response:', JSON.stringify(response, null, 2));

        if (!response.choices || response.choices.length === 0) {
          throw new Error('No choices returned from LLM');
        }

        const content = response.choices[0].message.content;

        if (!content || content.trim() === '') {
          console.error('LLM returned empty content');
          throw new Error('LLM returned empty content');
        }

        return { content };
      } catch (llmError) {
        console.error('LLM Error:', llmError);
        throw llmError;
      }
    };

    const RedpillClass = await getRedpill();
    const rp = new RedpillClass()
      .setLlm(llmFunction)
      .build();

    console.log('Generating spec...');
    const specResult = await rp.generateSpec(data, prompt);
    console.log('Spec generated:', JSON.stringify(specResult.spec));

    console.log('Executing...');
    const execResult = rp.execute(specResult.spec, data);
    console.log('Execution complete');

    return NextResponse.json({
      spec: specResult.spec,
      chartData: execResult.data,
      metadata: execResult.metadata,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
