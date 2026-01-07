import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { BEDROCK_MODEL_ID } from '../constants';

export class BedrockService {
  private client: BedrockRuntimeClient;
  // Default to Sonnet 3.5 (v1) if not specified
  private defaultModelId = BEDROCK_MODEL_ID;

  constructor(
    region = process.env.AWS_REGION || 'eu-west-1',
    profile = process.env.AWS_PROFILE || 'sso-bedrock'
  ) {
    this.client = new BedrockRuntimeClient({
      region,
      credentials: fromNodeProviderChain({ profile }),
    });
  }

  /**
   * Estimates token count for context size monitoring
   * Rough estimation: 1 token ≈ 4 characters
   */
  private estimateTokens(messages: any[]): number {
    const totalChars = JSON.stringify(messages).length;
    return Math.ceil(totalChars / 4);
  }

  public async invokeModel(
    messages: any[],
    modelId?: string,
    maxTokens = 2000,
    tools?: any[]
  ): Promise<{ content: any; usage: any }> {
    // Log context size for monitoring
    const estimatedTokens = this.estimateTokens(messages);
    if (estimatedTokens > 100000) {
      // eslint-disable-next-line no-console
      console.warn(
        `⚠️  Large context detected: ~${Math.round(estimatedTokens / 1000)}K tokens estimated`
      );
    }

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

    return {
      content: responseBody.content,
      usage: responseBody.usage,
    };
  }

  public async summarizeText(
    text: string,
    prompt: string
  ): Promise<{ text: string; usage: any }> {
    const messages = [
      {
        role: 'user',
        content: [{ type: 'text', text: `${prompt}\n\nTEXT:\n${text}` }],
      },
    ];

    try {
      const { content, usage } = await this.invokeModel(
        messages,
        undefined,
        1000
      );
      return { text: content[0].text, usage };
    } catch (e) {
      console.error('Summarization failed:', e);
      return { text: text, usage: null }; // Fallback
    }
  }
}
