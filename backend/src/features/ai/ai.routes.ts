import { Router } from 'express';
import { 
  syncVectorIndex, 
  chatWithAI, 
  explainQuestion, 
  getAiConfig, 
  updateAiConfig,
  extractQuestions 
} from './ai.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';
import { rateLimit } from '../../middlewares/rateLimit';

const router = Router();

// Rate limiter for heavy Vision / Multimodal question extraction tasks (15 requests per minute)
const extractionLimit = rateLimit({
  windowMs: 60_000,
  max: 15,
  keyPrefix: 'ai-extract-questions',
});

// Config routes (Admin only)
router.get('/config', requireAuth, rbacGuard(['admin']), getAiConfig);
router.post('/config', requireAuth, rbacGuard(['admin']), updateAiConfig);

// Vector Sync (Admin only)
router.post('/sync-embeddings', requireAuth, rbacGuard(['admin']), syncVectorIndex);

// Chat & Explanation (Authenticated users)
router.post('/chat', requireAuth, chatWithAI);
router.post('/explanation', requireAuth, explainQuestion);

// Porokh AI Question Importer: Secure Multimodal Image Question Extraction Endpoint
// (Rate limited, safe server-side Gemini execution with no exposed API keys)
router.post('/extract-questions', extractionLimit, extractQuestions);

export default router;
