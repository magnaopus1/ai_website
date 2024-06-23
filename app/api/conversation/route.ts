import { auth } from '@clerk/nextjs';
import { NextResponse } from 'next/server';
import fetch from 'node-fetch';
import { increaseApiLimit, checkApiLimit } from '@/lib/api-limit';
import { checkSubscription } from '@/lib/subscription';

type ChatCompletionRequestMessage = {
  role: string;
  content: string;
};

const instructionMessage: ChatCompletionRequestMessage = {
  role: 'system',
  content: 'You are a code generator. You must answer only in markdown code snippets. Use code comments for explanations.',
};

// Set your Hugging Face Inference API token here
const HUGGING_FACE_API_TOKEN = process.env.HUGGING_FACE_API_TOKEN;

// Define the expected response structure
interface HuggingFaceResponse {
  generated_text: string;
}

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    const body = await req.json();
    const { messages } = body;

    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    if (!messages) {
      return new NextResponse('Messages are required', { status: 400 });
    }

    const freeTrial = await checkApiLimit();
    const isPro = await checkSubscription();

    if (!freeTrial && !isPro) {
      return new NextResponse('Free trial has expired', { status: 403 });
    }

    // Prepare the input for the model
    const userMessages = messages.map((msg: ChatCompletionRequestMessage) => msg.content).join('\n');
    const inputText = `${instructionMessage.content}\n${userMessages}`;

    // Generate the response using the Hugging Face Inference API
    const response = await fetch('https://api-inference.huggingface.co/models/mistralai/Codestral-22B-v0.1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUGGING_FACE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: inputText,
        parameters: { max_length: 200 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate text: ${response.statusText}`);
    }

    // Assert the type of jsonResponse
    const jsonResponse: HuggingFaceResponse[] = await response.json() as HuggingFaceResponse[];
    const generatedText = jsonResponse[0]?.generated_text || '';

    if (!isPro) {
      await increaseApiLimit();
    }

    return NextResponse.json({ content: generatedText });
  } catch (error) {
    console.log('[CODE_ERROR]', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
