import { ulid } from "ulid";

/** New stable block/entity ID. ULIDs are lexicographically sortable by
 * creation time and safe to generate in the app layer on any runtime
 * (Node or Workers) — see docs/architecture.md ADR-3. */
export function newId(): string {
  return ulid();
}
