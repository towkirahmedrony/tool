import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import { 
  syncVectorEmbeddingsService, 
  chatWithAiService, 
  explainQuestionWithAiService,
  getAiConfigService, 
  updateAiConfigService 
} from './ai.service';
import { extractQuestionsFromImagesService } from './ai.extraction.service';

export const getAiConfig = catchAsync(async (req: Request, res: Response) => {
  const result = await getAiConfigService();
  sendResponse(res, 200, true, 'AI config fetched', result);
});

export const updateAiConfig = catchAsync(async (req: Request, res: Response) => {
  const result = await updateAiConfigService(req.body);
  sendResponse(res, 200, true, 'AI config updated', result);
});

export const syncVectorIndex = catchAsync(async (req: Request, res: Response) => {
  const result = await syncVectorEmbeddingsService();
  sendResponse(res, 200, true, 'Vector sync completed', result);
});

export const chatWithAI = catchAsync(async (req: Request, res: Response) => {
  const { message, sessionId, subjectId, lang } = req.body;
  const userId = (req as any).user?.id || 'anonymous_user';
  
  if (!subjectId) {
    return sendResponse(res, 400, false, 'Subject selection is required');
  }

  const result = await chatWithAiService(userId, sessionId, message, subjectId, lang);
  sendResponse(res, 200, true, 'AI response generated', result);
});

export const explainQuestion = catchAsync(async (req: Request, res: Response) => {
  const { question, lang } = req.body;
  const userId = (req as any).user?.id || 'anonymous_user';
  const result = await explainQuestionWithAiService(userId, question, lang);
  sendResponse(res, 200, true, 'AI explanation generated', result);
});

/**
 * Controller to extract bilingual questions and source metadata from images using Gemini Vision.
 * Validates payload and delegates to extraction service.
 */
export const extractQuestions = catchAsync(async (req: Request, res: Response) => {
  const { images, sourceHint, generateMissingExplanations } = req.body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return sendResponse(res, 400, false, 'At least one image is required for question extraction');
  }

  // Validate that each image object has base64 data and mimeType
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (!img.base64Data || typeof img.base64Data !== 'string') {
      return sendResponse(res, 400, false, `Image at index ${i} is missing valid base64Data`);
    }
    if (!img.mimeType || typeof img.mimeType !== 'string') {
      return sendResponse(res, 400, false, `Image at index ${i} is missing mimeType`);
    }
  }

  const result = await extractQuestionsFromImagesService({
    images,
    sourceHint,
    generateMissingExplanations: generateMissingExplanations !== false,
  });

  sendResponse(
    res,
    200,
    true,
    `Successfully extracted ${result.questions.length} questions from ${images.length} image(s)`,
    result
  );
});
