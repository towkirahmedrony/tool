import { supabase } from '@/shared/lib/supabase';
import { buildAdmissionCatalog } from '../lib/admissionAdapter';
import type {
  AdmissionCatalog,
  AdmissionExamPaperRow,
  AdmissionInstitutionRow,
} from '../types/admission';

/**
 * Admission data-access layer.
 *
 * Everything here reads the existing Porokh tables through the existing
 * Supabase client. No schema, RLS policy or backend route is changed.
 *
 * Admission content contract:
 * - `exam_papers.category = 'admission'`
 * - `exam_papers.is_published = true` for browsable papers
 * - optional `exam_papers.meta_data` keys documented in admissionAdapter.ts
 * - `institutions.type = 'admission'` for the university directory
 */

const ADMISSION_CATEGORY = 'admission';

const ADMISSION_PAPER_SELECT = `
  id,
  title,
  subject_id,
  category,
  exam_type,
  meta_data,
  is_published,
  is_premium,
  duration_min,
  total_marks,
  pass_mark,
  default_negative_marks,
  start_time,
  end_time,
  created_at,
  subjects:subject_id (
    name_bn,
    name_en,
    slug
  )
`;

const INSTITUTION_SELECT = `
  id,
  name_bn,
  name_en,
  short_name,
  slug,
  code,
  aliases,
  location,
  district,
  display_order,
  type,
  is_active
`;

const COUNT_CHUNK_SIZE = 200;

async function fetchQuestionCounts(
  examIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (examIds.length === 0) return counts;

  const chunks: string[][] = [];
  for (let index = 0; index < examIds.length; index += COUNT_CHUNK_SIZE) {
    chunks.push(examIds.slice(index, index + COUNT_CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase
        .from('exam_paper_questions')
        .select('exam_id')
        .in('exam_id', chunk);

      return { data, error };
    })
  );

  for (const result of results) {
    // Question counts are optional metadata. A failed count must not hide the
    // exams themselves, so this is the only intentionally non-fatal read.
    if (result.error || !result.data) continue;

    for (const row of result.data) {
      if (!row.exam_id) continue;
      counts.set(row.exam_id, (counts.get(row.exam_id) ?? 0) + 1);
    }
  }

  return counts;
}

export const admissionService = {
  async getExamPapers(): Promise<AdmissionExamPaperRow[]> {
    const { data, error } = await supabase
      .from('exam_papers')
      .select(ADMISSION_PAPER_SELECT)
      .eq('category', ADMISSION_CATEGORY)
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []) as unknown as AdmissionExamPaperRow[];
  },

  async getExamPaper(examId: string): Promise<AdmissionExamPaperRow | null> {
    if (!examId) return null;

    const { data, error } = await supabase
      .from('exam_papers')
      .select(ADMISSION_PAPER_SELECT)
      .eq('id', examId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return (data as unknown as AdmissionExamPaperRow) ?? null;
  },

  async getInstitutions(): Promise<AdmissionInstitutionRow[]> {
    const { data, error } = await supabase
      .from('institutions')
      .select(INSTITUTION_SELECT)
      // The backend accepts both kinds for admission sources; keep both so
      // universities created from `exam_references.source_kind` are visible.
      .in('type', [ADMISSION_CATEGORY, 'university'])
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name_bn', { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []) as AdmissionInstitutionRow[];
  },

  async getCatalog(): Promise<AdmissionCatalog> {
    const [papers, institutions] = await Promise.all([
      this.getExamPapers(),
      this.getInstitutions(),
    ]);

    const questionCounts = await fetchQuestionCounts(
      papers.map((paper) => paper.id)
    );

    return buildAdmissionCatalog(papers, institutions, questionCounts);
  },
};
