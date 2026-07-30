import { newId, type SpecBlock, type SpecPhase } from "@specpasa/core";
import { getDb, schema, eq } from "./db";
import { t } from "./strings";

/**
 * Derive the next-phase spec from a frozen source (FR-LIFE): insert the new
 * spec chained via derived_from_spec_id, seed its content, and attach the
 * frozen source as a spec reference so AI drafts in the new phase see it as
 * context (FR-LIFE-4, FR-AI-8). AI conversion persists its generated document
 * as immutable version 1; the manual advance path seeds the *working draft
 * buffer* instead — template content isn't written content yet, and keeping
 * it out of version history is what allows switching templates before the
 * first save.
 */
export async function deriveNextPhaseSpec(input: {
  spec: typeof schema.specs.$inferSelect;
  phase: SpecPhase;
  seed:
    { mode: "version"; blocks: SpecBlock[]; summary: string } | { mode: "draft"; markdown: string };
  userId: string;
  aiGenerated?: boolean;
  aiProviderConfigId?: string | null;
}): Promise<{ id: string }> {
  const { spec, phase, seed, userId } = input;
  const db = getDb();
  const ts = Date.now();
  const specId = newId();
  await db.insert(schema.specs).values({
    id: specId,
    intent_id: spec.intent_id,
    title: spec.title,
    phase,
    status: "draft",
    derived_from_spec_id: spec.id,
    created_by: userId,
    created_at: ts,
    updated_at: ts,
    ...(seed.mode === "draft"
      ? { draft_markdown: seed.markdown, draft_saved_at: ts, draft_saved_by: userId }
      : {}),
  });
  if (seed.mode === "version") {
    const versionId = newId();
    await db.insert(schema.spec_versions).values({
      id: versionId,
      spec_id: specId,
      number: 1,
      blocks: seed.blocks,
      summary: seed.summary,
      created_by: userId,
      ai_generated: input.aiGenerated ?? false,
      ai_provider_config_id: input.aiProviderConfigId ?? null,
      created_at: ts,
    });
    await db
      .update(schema.specs)
      .set({ current_version_id: versionId })
      .where(eq(schema.specs.id, specId));
  }
  // The frozen source rides along as a spec reference so AI drafts in the
  // new phase see it as context (FR-LIFE-4, FR-AI-8).
  await db.insert(schema.spec_references).values({
    id: newId(),
    spec_id: specId,
    kind: "spec",
    title: `${spec.title} (${t.phases.label(spec.phase)}, frozen)`,
    payload: { spec_id: spec.id },
    created_by: userId,
    created_at: ts,
  });
  return { id: specId };
}

/** The seed the manual (non-AI) advance path starts the new phase with:
 * title heading + provenance note + the resolved template body. */
export function seedMarkdownForPhase(
  spec: typeof schema.specs.$inferSelect,
  phase: SpecPhase,
  frozenVersionNumber: number,
  templateContent: string,
): string {
  return [
    t.lifecycle.seedHeading(spec.title, phase),
    t.lifecycle.seedNote(spec.phase, frozenVersionNumber),
    templateContent,
  ].join("\n\n");
}
