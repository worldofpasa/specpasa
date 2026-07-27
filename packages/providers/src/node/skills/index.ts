import { grilling } from "./grilling.js";
import { toErd } from "./to-erd.js";
import { toSpec } from "./to-spec.js";
import { toTickets } from "./to-tickets.js";
import { wayfinder } from "./wayfinder.js";
import { type VendoredSkill } from "./types.js";

export { type VendoredSkill, UPSTREAM_MIT_NOTICE } from "./types.js";

export const VENDORED_SKILLS = {
  grilling,
  wayfinder,
  "to-spec": toSpec,
  "to-erd": toErd,
  "to-tickets": toTickets,
} as const satisfies Record<string, VendoredSkill>;

export type AgentSkillName = keyof typeof VENDORED_SKILLS;
