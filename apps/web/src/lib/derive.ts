import { blocksFromMarkdown, newId, type SpecBlock, type SpecPhase } from "@specpasa/core";
import { getDb, schema, eq } from "./db";
import { t } from "./strings";

/**
 * Derive the next-phase spec from a frozen source (FR-LIFE): insert the new
 * spec chained via derived_from_spec_id, its version 1, and attach the frozen
 * source as a spec reference so AI drafts in the new phase see it as context
 * (FR-LIFE-4, FR-AI-8). Shared by the manual advancePhase action (placeholder
 * seed) and the AI conversion route (generated document).
 */
export async function deriveNextPhaseSpec(input: {
  spec: typeof schema.specs.$inferSelect;
  phase: SpecPhase;
  blocks: SpecBlock[];
  summary: string;
  userId: string;
  aiGenerated?: boolean;
  aiProviderConfigId?: string | null;
}): Promise<{ id: string }> {
  const { spec, phase, blocks, summary, userId } = input;
  const db = getDb();
  const ts = Date.now();
  const specId = newId();
  const versionId = newId();
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
  });
  await db.insert(schema.spec_versions).values({
    id: versionId,
    spec_id: specId,
    number: 1,
    blocks,
    summary,
    created_by: userId,
    ai_generated: input.aiGenerated ?? false,
    ai_provider_config_id: input.aiProviderConfigId ?? null,
    created_at: ts,
  });
  await db
    .update(schema.specs)
    .set({ current_version_id: versionId })
    .where(eq(schema.specs.id, specId));
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

/** The placeholder seed the manual (non-AI) advance path starts the new phase with. */
export function placeholderSeedBlocks(
  spec: typeof schema.specs.$inferSelect,
  phase: SpecPhase,
  frozenVersionNumber: number,
): SpecBlock[] {
  return blocksFromMarkdown(
    [
      t.lifecycle.seedHeading(spec.title, phase),
      t.lifecycle.seedNote(spec.phase, frozenVersionNumber),
    ].join("\n\n"),
  );
}
