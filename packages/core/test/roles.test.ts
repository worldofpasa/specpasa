import { describe, expect, it } from "vitest";
import { MEMBER_ROLES } from "../src/types.js";
import { canComment, canEdit, canManageMembers, canView, isMemberRole } from "../src/roles.js";

describe("role policy", () => {
  it("orders capabilities by privilege (MEMBER_ROLES is owner→viewer)", () => {
    expect(MEMBER_ROLES.map(canView)).toEqual([true, true, true, true]);
    expect(MEMBER_ROLES.map(canComment)).toEqual([true, true, true, false]);
    expect(MEMBER_ROLES.map(canEdit)).toEqual([true, true, false, false]);
    expect(MEMBER_ROLES.map(canManageMembers)).toEqual([true, false, false, false]);
  });

  it("grants exactly the documented capabilities per role", () => {
    expect(canManageMembers("owner")).toBe(true);
    expect(canManageMembers("editor")).toBe(false);

    expect(canEdit("owner")).toBe(true);
    expect(canEdit("editor")).toBe(true);
    expect(canEdit("commenter")).toBe(false);
    expect(canEdit("viewer")).toBe(false);

    expect(canComment("commenter")).toBe(true);
    expect(canComment("viewer")).toBe(false);

    for (const role of MEMBER_ROLES) expect(canView(role)).toBe(true);
  });

  it("narrows strings to MemberRole", () => {
    expect(isMemberRole("editor")).toBe(true);
    expect(isMemberRole("admin")).toBe(false);
  });
});
