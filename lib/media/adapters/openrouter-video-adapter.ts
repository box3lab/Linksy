/**
 * OpenRouter Video Generation Adapter
 */

import { createOpenAI } from '@ai-sdk/openai';
import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('OpenRouterVideoAdapter');

/**
 * Generate video using OpenRouter
 */
export async function generateWithOpenRouterVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  try {
    const openrouter = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
    });

    // OpenRouter video generation via chat completion
    const { generateText } = await import('ai');
    const { text } = await generateText({
      model: openrouter.chat(config.model || 'anthropic/claude-3.5-sonnet'),
      prompt: `Generate a video based on this prompt: ${options.prompt}. 
      Please respond with a JSON object containing the video URL and metadata.
      Format: {"video_url": "url", "width": 1024, "height": 576, "duration": 6}`,
    });

    if (!text) {
      throw new Error('No response content from OpenRouter');
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch (_parseError) {
      throw new Error('Invalid JSON response from OpenRouter');
    }

    if (!result.video_url) {
      throw new Error('No video URL in response from OpenRouter');
    }

    return {
      url: result.video_url,
      width: result.width || 1024,
      height: result.height || 576,
      duration: result.duration || 6,
    };
  } catch (error) {
    log.error('OpenRouter video generation failed:', error);
    throw new Error(
      `OpenRouter video generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Test OpenRouter video connectivity
 */
export async function testOpenRouterVideoConnectivity(
  config: VideoGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  try {
    const openrouter = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
    });

    // Test with a minimal chat completion request
    const { generateText } = await import('ai');
    await generateText({
      model: openrouter.chat(config.model || 'anthropic/claude-3.5-sonnet'),
      prompt: 'test',
    });

    return { success: true, message: 'Connection successful' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('OpenRouter video connectivity test failed:', error);

    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      return { success: false, message: 'API key is invalid or expired' };
    }
    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      return { success: false, message: 'Model not found or API endpoint error' };
    }
    if (errorMessage.includes('429')) {
      return { success: false, message: 'API rate limit exceeded' };
    }

    return { success: false, message: `Connection failed: ${errorMessage}` };
  }
}
