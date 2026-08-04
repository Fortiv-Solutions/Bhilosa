/**
 * POST /api/ai/map-activity-category
 *
 * Maps construction activity names onto Master Budget category names.
 *
 * This exists because the two vocabularies genuinely differ — a site engineer
 * raises "Masonry / Brickwork" while the Master Budget calls it "Civil Works" —
 * and word-overlap similarity cannot bridge that. Measured against the live
 * 24-category budget, the previous string matcher scored 0.000 for
 * "Masonry / Brickwork" and 0.167 for "Excavation / Foundation", both below its
 * own 0.3 threshold.
 *
 * PRIVACY / SCOPE CONTRACT — deliberately narrow:
 *   The model receives ONLY activity names and category names, as plain strings.
 *   It never receives budget amounts, allocations, committed or spent figures,
 *   rates, quantities, vendor names, project identity, or any UUID. Categories
 *   are sent as a numbered list and the model answers with indices, so even the
 *   category primary keys stay server-side.
 *
 *   The model therefore cannot influence any money value. It only picks a label.
 *   All arithmetic happens later, client-side, from Master Budget + Variance
 *   figures that the model never saw.
 *
 * Results are cached by the caller in public.activity_budget_category_map, so a
 * given activity is resolved once and never re-sent.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Cheap by default; override per-deployment. */
const MODEL = process.env.OPENAI_ACTIVITY_MAP_MODEL || 'gpt-4o-mini';

const MAX_ACTIVITIES = 40;
const MAX_CATEGORIES = 200;

export interface ActivityMappingResult {
  activity: string;
  /** Index into the categories array, or null when nothing fits. */
  categoryIndex: number | null;
  confidence: number;
  reasoning: string;
}

interface RequestBody {
  activities?: unknown;
  categories?: unknown;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Accepts a loose string[] and returns trimmed, de-duplicated, capped entries. */
function cleanStrings(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const text = raw.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text.slice(0, 200));
    if (out.length >= cap) break;
  }
  return out;
}

const SYSTEM_PROMPT = `You classify construction work activities into budget categories for an Indian real-estate / construction ERP.

You are given:
  - A numbered list of BUDGET CATEGORIES.
  - A list of ACTIVITY names used by site engineers.

For each activity, choose the single most appropriate budget category.

Rules:
- Answer with the category NUMBER from the list. Use null when no category is a reasonable fit.
- Prefer the most specific category that genuinely covers the activity.
- Masonry, brickwork, plaster, RCC, concreting and similar structural site work usually belong to a general civil works category when no more specific one exists.
- Material-supply activities belong to a materials category when the list distinguishes materials from labour.
- Do NOT invent categories. Do NOT guess wildly: if the fit is poor, return null so a human can map it.
- confidence is 0.0-1.0 reflecting how certain the fit is.
- reasoning is at most 12 words.

Respond with JSON only, in exactly this shape:
{"mappings":[{"activity":"<verbatim activity>","categoryNumber":<int|null>,"confidence":<0..1>,"reasoning":"<short>"}]}`;

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return badRequest('Request body must be JSON.');
  }

  const activities = cleanStrings(body.activities, MAX_ACTIVITIES);
  const categories = cleanStrings(body.categories, MAX_CATEGORIES);

  if (activities.length === 0) return badRequest('At least one activity name is required.');
  if (categories.length === 0) return badRequest('At least one category name is required.');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Explicit, not silent. The caller falls back to exact-match + Miscellaneous
    // and the UI must not claim an AI mapping happened.
    return NextResponse.json(
      {
        error: 'OPENAI_API_KEY is not configured. Activity mapping falls back to exact matching.',
        code: 'no_api_key',
      },
      { status: 503 },
    );
  }

  const categoryList = categories.map((name, i) => `${i + 1}. ${name}`).join('\n');
  const activityList = activities.map((name) => `- ${name}`).join('\n');

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `BUDGET CATEGORIES:\n${categoryList}\n\nACTIVITIES:\n${activityList}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('The model returned an empty response.');

    let parsed: { mappings?: unknown };
    try {
      parsed = JSON.parse(raw) as { mappings?: unknown };
    } catch {
      throw new Error('The model returned malformed JSON.');
    }

    const byActivity = new Map<string, ActivityMappingResult>();
    if (Array.isArray(parsed.mappings)) {
      for (const entry of parsed.mappings as Record<string, unknown>[]) {
        const activity = typeof entry.activity === 'string' ? entry.activity.trim() : '';
        if (!activity) continue;

        // Match back to the activity we actually sent — the model can reformat.
        const original = activities.find((a) => a.toLowerCase() === activity.toLowerCase());
        if (!original) continue;

        const num = Number(entry.categoryNumber);
        // 1-based from the model; validate hard before trusting it as an index.
        const categoryIndex =
          Number.isInteger(num) && num >= 1 && num <= categories.length ? num - 1 : null;

        const confRaw = Number(entry.confidence);
        const confidence = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0;

        byActivity.set(original.toLowerCase(), {
          activity: original,
          categoryIndex,
          confidence: categoryIndex === null ? 0 : confidence,
          reasoning:
            typeof entry.reasoning === 'string' ? entry.reasoning.trim().slice(0, 160) : '',
        });
      }
    }

    // Anything the model skipped is explicitly unmapped, never silently dropped.
    const mappings: ActivityMappingResult[] = activities.map(
      (activity) =>
        byActivity.get(activity.toLowerCase()) ?? {
          activity,
          categoryIndex: null,
          confidence: 0,
          reasoning: 'No mapping returned by the model.',
        },
    );

    return NextResponse.json({ model: MODEL, mappings });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Activity mapping failed: ${message}`, code: 'model_error' },
      { status: 502 },
    );
  }
}
