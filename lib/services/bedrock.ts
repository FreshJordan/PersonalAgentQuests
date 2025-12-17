import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

export class BedrockService {
  private client: BedrockRuntimeClient;
  // Default to Sonnet 3.5 (v1) if not specified
  private defaultModelId = 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0';

  constructor(
    region = process.env.AWS_REGION || 'eu-west-1',
    profile = process.env.AWS_PROFILE || 'sso-bedrock'
  ) {
    this.client = new BedrockRuntimeClient({
      region,
      credentials: fromNodeProviderChain({ profile }),
    });
  }

  public async invokeModel(
    messages: any[],
    modelId?: string,
    maxTokens = 2000,
    tools?: any[]
  ): Promise<any> {
    const payload: any = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      messages: messages,
    };

    if (tools) {
      payload.tools = tools;
    }

    const command = new InvokeModelCommand({
      modelId: modelId || this.defaultModelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(JSON.stringify(payload)),
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    if (responseBody.error) {
      throw new Error(JSON.stringify(responseBody.error));
    }

    return responseBody.content;
  }

  public async summarizeText(text: string, prompt: string): Promise<string> {
    const messages = [
      {
        role: 'user',
        content: [{ type: 'text', text: `${prompt}\n\nTEXT:\n${text}` }],
      },
    ];

    try {
      const content = await this.invokeModel(messages, undefined, 1000);
      return content[0].text;
    } catch (e) {
      console.error('Summarization failed:', e);
      return text; // Fallback
    }
  }
}
