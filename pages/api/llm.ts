import type { NextApiRequest, NextApiResponse } from 'next';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { BEDROCK_MODEL_ID } from '../../lib/constants';

type Data = {
  result?: string;
  error?: string;
  debug?: any;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  // Force region if not present, but prefer env vars
  const region = process.env.AWS_REGION || 'eu-west-1';
  // Fallback to the specific profile the user mentioned if env var is missing
  const profile = process.env.AWS_PROFILE || 'sso-bedrock';

  // Debugging
  const debugInfo = {
    AWS_REGION: region,
    AWS_PROFILE: profile,
    HOME: process.env.HOME,
  };

  // eslint-disable-next-line no-console
  console.log('--- AWS API Debug Info ---');
  // eslint-disable-next-line no-console
  console.log(debugInfo);

  // Initialize the Bedrock client
  // explicit provider chain to ensure it looks everywhere
  const client = new BedrockRuntimeClient({
    region: region,
    credentials: fromNodeProviderChain({
      profile: profile,
    }),
  });

  try {
    // Using Claude 3 Sonnet as the model
    const modelId = BEDROCK_MODEL_ID;

    // Prepare the payload for Claude 3
    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: query,
            },
          ],
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(JSON.stringify(payload)),
    });

    const response = await client.send(command);

    // Decode the response
    const responseBody = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(responseBody);

    // Extract text content from Claude 3 response
    const resultText = parsedResponse.content[0].text;

    return res.status(200).json({ result: resultText });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Bedrock API Error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to invoke Bedrock model';

    return res.status(500).json({
      error: errorMessage,
      debug: debugInfo,
    });
  }
}
