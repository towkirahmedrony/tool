# Admission feature (frontend-only)

The admission browsing experience is built entirely on the existing Porokh
Supabase tables and the existing exam attempt API. No backend route, schema,
migration, RLS policy or database function is added or modified.

## Data used

| Purpose | Existing source |
| --- | --- |
| Admission exam papers | `exam_papers` where `category = 'admission'` and `is_published = true` |
| Universities | `institutions` where `type` is `admission` or `university` and `is_active = true` |
| Question count | `exam_paper_questions` rows for the returned exam ids |
| Subjects (optional label) | `subjects` joined through `exam_papers.subject_id` |
| Question content | `GET /api/v1/exams/user/attempts/:id/questions` (sanitized) |
| Attempt / deadline | `POST /api/v1/exams/user/attempts/start` |
| Draft answers | `PATCH /api/v1/exams/user/attempts/:id/answers` |
| Submission and grading | `POST /api/v1/exams/user/submit` with `attempt_id` |
| Result review | Existing `/exam/analysis/:id` page and `GET /exams/user/result/:id` |

## `exam_papers.meta_data` contract

The existing table has no first-class admission group, university, unit, year or
model-test number columns. The frontend adapter reads these optional JSON keys:

```
group | stream | group_slug | stream_slug      -> science / arts / commerce
university_id | institution_id                 -> institutions.id
university_slug | institution_slug | code      -> institutions.slug / code
university | university_name | institution     -> institution name (bn/en)
unit | unit_slug | unit_code | unit_name        -> unit (e.g. A, B, ক, খ)
year | exam_year                               -> historical paper year
model_test_no | model_no | test_no             -> model test number
order | sequence | display_order               -> model test ordering
exam_type | type                               -> model-test / past-exams
```

Group names accept Bangla (`বিজ্ঞান`, `মানবিক`, `ব্যবসায় শিক্ষা`) and English.
Unit letters are normalised (`ক`/`A` -> `ka`, `খ`/`B` -> `kha`, ...).

`category` is the existing discriminator (the same convention used by the
existing board exam tab with `board_exam`). Admission rows must therefore use
`category = 'admission'`.

## Missing backend capabilities (reported, not worked around)

1. **No admission-specific API.** The frontend derives browsing structure from
   `exam_papers` and `institutions`; there is no `admission` endpoint to list
   groups/universities/units.
2. **No first-class university/group/unit columns.** The adapter contract above
   is required in `meta_data`; untagged rows are excluded from group-specific
   lists and are counted in the catalog diagnostics.
3. **No institution logo or description columns.** Cards use the university
   initial and the available `location`/`district` fields only.
4. **No bilingual exam title column.** `exam_papers.title` is a single value.
   University names use `name_bn`/`name_en`; question/option text uses the
   translated `text_bn`/`text_en` fields returned by the attempt endpoint.
5. **Attempt lifecycle migration.** The backend migration
   `20261019000000_exam_attempt_lifecycle.sql` adds `exam_progress.kind/status/
   started_at/deadline_at/...` and `exam_history.attempt_id`. If that migration
   has not been applied, starting an admission exam fails closed with a 503/500
   and the UI shows the unavailable state. An exam must also have a non-zero
   `duration_min` and at least one `exam_paper_questions` row.
6. **No admission data was seeded or mocked.** If no `is_published` admission
   papers exist, the pages show localized empty states instead of fabricated
   content.

## Security

- The answer key is never fetched for display; attempt questions are sanitized
  by the backend.
- Scores are produced only by the backend submission endpoint; the client never
  posts a calculated score.
- Direct `/admission/exam/:examId` navigation still goes through
  `PermissionGuard` and the backend's published/window/attempt checks.
