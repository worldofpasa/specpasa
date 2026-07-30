import { TEMPLATE_KINDS, type TemplateKind } from "@specpasa/core";
import { getDb, schema, and, asc, eq } from "./db";
import { t } from "./strings";

/**
 * Document templates (FR-LIFE adjacent): every template kind ships a code-
 * defined standard; workspaces can add their own and mark one as default.
 * The resolved default seeds blank documents and rides along as structure
 * guidance for AI generation. Built-ins are code, not rows — they can't be
 * deleted and always remain as the fallback default.
 */
export interface TemplateOption {
  /** ULID for workspace rows, "builtin:<kind>" for code-defined standards. */
  id: string;
  kind: TemplateKind;
  name: string;
  content: string;
  builtIn: boolean;
  isDefault: boolean;
}

export const builtinTemplateId = (kind: TemplateKind): string => `builtin:${kind}`;

export function builtinTemplateContent(kind: TemplateKind): string {
  return t.templates
    .builtinSections(kind)
    .map(([heading, hint]) => `## ${heading}\n\n_${hint}_`)
    .join("\n\n");
}

function builtinTemplate(kind: TemplateKind, isDefault: boolean): TemplateOption {
  return {
    id: builtinTemplateId(kind),
    kind,
    name: t.templates.builtinName(kind),
    content: builtinTemplateContent(kind),
    builtIn: true,
    isDefault,
  };
}

/** All templates of one kind: the built-in standard first, then workspace
 * rows. Exactly one option carries isDefault. */
export async function listTemplates(
  workspaceId: string,
  kind: TemplateKind,
): Promise<TemplateOption[]> {
  const rows = await getDb()
    .select()
    .from(schema.spec_templates)
    .where(
      and(
        eq(schema.spec_templates.workspace_id, workspaceId),
        eq(schema.spec_templates.kind, kind),
      ),
    )
    .orderBy(asc(schema.spec_templates.created_at));
  const hasCustomDefault = rows.some((row) => row.is_default);
  return [
    builtinTemplate(kind, !hasCustomDefault),
    ...rows.map((row) => ({
      id: row.id,
      kind,
      name: row.name,
      content: row.content,
      builtIn: false,
      isDefault: row.is_default,
    })),
  ];
}

export async function listAllTemplates(
  workspaceId: string,
): Promise<Record<TemplateKind, TemplateOption[]>> {
  const entries = await Promise.all(
    TEMPLATE_KINDS.map(async (kind) => [kind, await listTemplates(workspaceId, kind)] as const),
  );
  return Object.fromEntries(entries) as Record<TemplateKind, TemplateOption[]>;
}

export async function resolveDefaultTemplate(
  workspaceId: string,
  kind: TemplateKind,
): Promise<TemplateOption> {
  const options = await listTemplates(workspaceId, kind);
  return options.find((option) => option.isDefault) ?? options[0]!;
}
