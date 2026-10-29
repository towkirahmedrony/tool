import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { z } from 'zod';
import logger from '../../lib/utils/logger';

// Schema for raw option extracted from Gemini
const OptionSchema = z.object({
  id: z.number().int().min(1),
  text_bn: z.string().default(''),
  text_en: z.string().default(''),
  isCorrect: z.boolean().default(false),
});

// Schema for raw question extracted from Gemini
const ExtractedQuestionSchema = z.object({
  type: z.literal('mcq').default('mcq'),
  body: z.object({
    text_bn: z.string().default(''),
    text_en: z.string().default(''),
    image_url: z.string().nullable().default(null),
  }),
  options: z.array(OptionSchema).min(2).default([]),
  explanation: z.object({
    bn: z.string().default(''),
    en: z.string().default(''),
  }).default({ bn: '', en: '' }),
  difficulty_level: z.enum(['easy', 'medium', 'hard']).default('medium'),
  source_type: z.enum(['board_exam', 'admission', 'school', 'other']).default('board_exam'),
  exam_references: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  source_metadata: z.object({
    institution: z.string().optional(),
    exam_name: z.string().optional(),
    year: z.union([z.string(), z.number()]).optional(),
  }).optional(),
  requires_manual_answer_verification: z.boolean().default(false),
  uncertain_ocr_flags: z.array(z.string()).default([]),
  source_image_index: z.number().int().min(0).default(0),
});

const ExtractionResponseSchema = z.object({
  batch_source_info: z.object({
    detected_institution: z.string().optional(),
    detected_exam_name: z.string().optional(),
    detected_year: z.union([z.string(), z.number()]).optional(),
    detected_subject: z.string().optional(),
  }).optional(),
  questions: z.array(ExtractedQuestionSchema),
});

export type ExtractedQuestion = z.infer<typeof ExtractedQuestionSchema>;
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;

export interface ExtractImageInput {
  base64Data: string;
  mimeType: string;
  fileName?: string;
  imageId?: string;
}

export interface ExtractQuestionsPayload {
  images: ExtractImageInput[];
  sourceHint?: {
    institution?: string;
    exam_name?: string;
    year?: string | number;
    subject_id?: string;
  };
  generateMissingExplanations?: boolean;
}

const getGeminiClient = (): GoogleGenerativeAI => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_EMBEDDING_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }
  return new GoogleGenerativeAI(apiKey);
};

const EXTRACTION_SYSTEM_PROMPT = `
You are an expert AI Exam Paper Digitizer and Bilingual Educational Assistant for Bangladeshi education curricula (NCTB SSC/HSC, University Admission Tests like BUET, Dhaka University, Medical Admission, and Top College Examinations).

Your task is to analyze the provided question-paper image(s) in their exact uploaded order and extract every Multiple Choice Question (MCQ) into structured JSON.

### Extraction & Formatting Rules:
1. **Bilingual Requirement**:
   - Provide accurate Bengali text (text_bn) AND English text (text_en) for the question statement and all options.
   - If the paper is printed only in Bengali, preserve the exact Bengali phrasing and translate it into clear English for text_en.
   - If printed only in English, provide an accurate Bengali translation for text_bn.
   
2. **Mathematical and Scientific Expressions**:
   - MUST preserve all formulas, mathematical symbols, equations, superscripts, subscripts, vectors, and units using standard LaTeX notation enclosed in dollar signs ($...$), e.g. $\\vec{A} \\cdot \\vec{B} = 0$, $E = mc^2$, $\\pm \\frac{3\\sqrt{3}}{2}$, $10\\text{ ms}^{-1}$, $\\text{H}_2\\text{SO}_4$.
   - Do NOT omit indices, square roots, fractions, Greek letters, or vector arrows.

3. **Options Extraction**:
   - Extract all options (usually 4 options: A/B/C/D or ১/২/৩/৪ or ক/খ/গ/ঘ).
   - Normalize IDs to integers starting from 1 (1 for A/১/ক, 2 for B/২/খ, 3 for C/৩/গ, 4 for D/৪/ঘ).
   - Ensure options contain both text_bn and text_en.

4. **Correct Answer Key Detection (CRUCIAL SAFETY RULE)**:
   - Identify if an answer is explicitly marked on the paper (e.g., filled bubble, tick mark, circled option, or printed answer key at the bottom).
   - IF AND ONLY IF there is explicit printed evidence of the correct answer, set isCorrect: true on that specific option and false on others.
   - IF THE ANSWER IS NOT EXPLICITLY PRINTED, OR IS UNREADABLE / AMBIGUOUS:
     * Set isCorrect: false for ALL options.
     * Set requires_manual_answer_verification: true.
     * NEVER silently guess or fabricate the correct answer.

5. **Explanations**:
   - If an explanation is printed on the paper, extract it.
   - If no explanation is printed, generate a clear, step-by-step pedagogical explanation in both Bengali (bn) and English (en).

6. **Source Metadata & References**:
   - Extract printed institution/board (e.g., "Dhaka Education Board", "BUET", "Notre Dame College"), exam name ("HSC Examination 2023", "Admission Test"), and year ("2023", "2022").
   - Populate exam_references array (e.g. ["Dhaka Board 2023"]).
   - Add relevant physics/chemistry/math/biology topic tags (e.g. ["vectors", "dot-product"]).
   - Do NOT invent or fabricate metadata if not visible.

7. **OCR Uncertainty & Warnings**:
   - If any text or formula is partially cut off, smudged, or ambiguous, add a concise warning to uncertain_ocr_flags (e.g., "Formula subscript partially blurry in image 1").

8. **Output Schema**:
Return ONLY valid JSON matching this schema:
{
  "batch_source_info": {
    "detected_institution": string or null,
    "detected_exam_name": string or null,
    "detected_year": string or number or null,
    "detected_subject": string or null
  },
  "questions": [
    {
      "type": "mcq",
      "body": {
        "text_bn": "...",
        "text_en": "...",
        "image_url": null
      },
      "options": [
        { "id": 1, "text_bn": "...", "text_en": "...", "isCorrect": false },
        { "id": 2, "text_bn": "...", "text_en": "...", "isCorrect": true },
        { "id": 3, "text_bn": "...", "text_en": "...", "isCorrect": false },
        { "id": 4, "text_bn": "...", "text_en": "...", "isCorrect": false }
      ],
      "explanation": {
        "bn": "...",
        "en": "..."
      },
      "difficulty_level": "easy" | "medium" | "hard",
      "source_type": "board_exam" | "admission" | "school" | "other",
      "exam_references": ["..."],
      "tags": ["..."],
      "source_metadata": {
        "institution": "...",
        "exam_name": "...",
        "year": 2023
      },
      "requires_manual_answer_verification": false,
      "uncertain_ocr_flags": [],
      "source_image_index": 0
    }
  ]
}
`;

/**
 * Clean and parse JSON response from Gemini output (handling markdown fences if returned)
 */
function cleanAndParseJson(rawText: string): unknown {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
  }
  cleaned = cleaned.trim();
  return JSON.parse(cleaned);
}

/**
 * Service to extract MCQ questions from one or more images using Gemini Vision.
 */
export async function extractQuestionsFromImagesService(
  payload: ExtractQuestionsPayload
): Promise<ExtractionResponse> {
  const { images, sourceHint } = payload;

  if (!images || images.length === 0) {
    throw new Error('No images provided for extraction');
  }

  // Maximum 10 images per batch for server safety
  if (images.length > 10) {
    throw new Error('A maximum of 10 images can be processed per batch');
  }

  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.1, // Low temperature for high factual OCR precision
      responseMimeType: 'application/json',
    },
  });

  // Prepare multimodal parts: system instructions + user hints + ordered image parts
  const parts: (string | Part)[] = [];

  let userPrompt = `${EXTRACTION_SYSTEM_PROMPT}\n\nPlease extract all MCQs from the attached ${images.length} image(s) in sequential order.`;
  if (sourceHint) {
    userPrompt += `\n\nUser Provided Context/Hints: ${JSON.stringify(sourceHint)}`;
  }
  parts.push(userPrompt);

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    // Strip data URL header if present (e.g. data:image/png;base64,...)
    let cleanBase64 = img.base64Data;
    if (cleanBase64.includes(';base64,')) {
      cleanBase64 = cleanBase64.split(';base64,')[1];
    }

    const mime = img.mimeType || 'image/jpeg';
    parts.push({
      inlineData: {
        data: cleanBase64,
        mimeType: mime,
      },
    });
  }

  try {
    logger.info(`Sending ${images.length} image(s) to Gemini 2.5 Flash for MCQ extraction`);
    const result = await model.generateContent(parts);
    const rawResponse = result.response.text();

    if (!rawResponse) {
      throw new Error('Empty response received from Gemini model');
    }

    const parsedJson = cleanAndParseJson(rawResponse);
    const validated = ExtractionResponseSchema.parse(parsedJson);

    // Post-process questions to enforce business logic:
    // If no option has isCorrect = true, mark requires_manual_answer_verification = true
    const sanitizedQuestions = validated.questions.map((q) => {
      const hasCorrect = q.options.some((o) => o.isCorrect);
      let requiresManual = q.requires_manual_answer_verification || !hasCorrect;
      
      // If multiple options were marked correct or none, ensure manual verification is requested
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) {
        requiresManual = true;
      }

      return {
        ...q,
        requires_manual_answer_verification: requiresManual,
      };
    });

    return {
      batch_source_info: validated.batch_source_info,
      questions: sanitizedQuestions,
    };
  } catch (error: unknown) {
    logger.error('Error during Gemini question extraction:', error);
    if (error instanceof z.ZodError) {
      throw new Error(`Failed to parse extracted question data from AI: ${error.message}`);
    }
    const errMsg = error instanceof Error ? error.message : 'Question extraction failed';
    throw new Error(errMsg);
  }
}
