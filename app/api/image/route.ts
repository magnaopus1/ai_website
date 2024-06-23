import { auth } from '@clerk/nextjs';
import { NextResponse } from 'next/server';
import fetch from 'node-fetch';
import { increaseApiLimit, checkApiLimit } from '@/lib/api-limit';
import { checkSubscription } from '@/lib/subscription';

// Set your Hugging Face Inference API token here
const HUGGING_FACE_API_TOKEN = process.env.HUGGING_FACE_API_TOKEN;

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    const body = await req.json();
    const { prompt, amount = 1, resolution = '512x512' } = body;

    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    if (!prompt) {
      return new NextResponse('Prompt is required', { status: 400 });
    }

    if (!amount) {
      return new NextResponse('Amount is required', { status: 400 });
    }

    if (!resolution) {
      return new NextResponse('Resolution is required', { status: 400 });
    }

    const freeTrial = await checkApiLimit();
    const isPro = await checkSubscription();

    if (!freeTrial && !isPro) {
      return new NextResponse('Free trial has expired', { status: 403 });
    }

    // Generate the images using the Hugging Face Inference API
    const images = await Promise.all(
      Array.from({ length: amount }).map(async () => {
        const response = await fetch('https://api-inference.huggingface.co/models/dalle-mini/dalle-mega', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HUGGING_FACE_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: { num_return_sequences: 1, height: parseInt(resolution.split('x')[0], 10), width: parseInt(resolution.split('x')[1], 10) }
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to generate image: ${response.statusText}`);
        }

        const imageBuffer = await response.buffer();
        const base64Image = imageBuffer.toString('base64');

        return `data:image/png;base64,${base64Image}`;
      })
    );

    if (!isPro) {
      await increaseApiLimit();
    }

    return NextResponse.json({ images });
  } catch (error) {
    console.log('[IMAGE_ERROR]', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}

