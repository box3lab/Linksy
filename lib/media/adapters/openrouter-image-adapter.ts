/**
 * OpenRouter Image Generation Adapter
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateImage as generateImageAI } from 'ai';
import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('OpenRouterImageAdapter');

/**
 * Generate image using OpenRouter
 */
export async function generateWithOpenRouterImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  try {
    const openrouter = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
    });

    // Calculate dimensions from options
    let width = options.width || 1024;
    let height = options.height || 1024;

    if (options.aspectRatio) {
      const dimensions = aspectRatioToDimensions(options.aspectRatio, 1024);
      width = dimensions.width;
      height = dimensions.height;
    }

    const { image } = await generateImageAI({
      model: openrouter.image(config.model || 'anthropic/claude-3.5-sonnet'),
      prompt: options.prompt,
      size: `${width}x${height}` as `${number}x${number}`,
      n: 1,
    });

    return {
      url: image.base64 ? `data:image/png;base64,${image.base64}` : undefined,
      base64: image.base64,
      width: width,
      height: height,
    };
  } catch (error) {
    log.error('OpenRouter image generation failed:', error);
    throw new Error(
      `OpenRouter image generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Helper function to convert aspect ratio to dimensions
 */
function aspectRatioToDimensions(
  ratio: string,
  maxWidth = 1024,
): { width: number; height: number } {
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h) return { width: maxWidth, height: Math.round((maxWidth * 9) / 16) };
  return { width: maxWidth, height: Math.round((maxWidth * h) / w) };
}

/**
 * Test OpenRouter image connectivity
 */
export async function testOpenRouterImageConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  try {
    const openrouter = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
    });

    // Test with a minimal image generation request
    await generateImageAI({
      model: openrouter.image(config.model || 'anthropic/claude-3-5-sonnet'),
      prompt: 'test',
      size: '256x256',
      n: 1,
    });

    return { success: true, message: 'Connection successful' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('OpenRouter image connectivity test failed:', error);

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
