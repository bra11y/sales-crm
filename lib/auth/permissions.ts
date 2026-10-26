// Who can open what. Like Atlas: permissions are "area:action" strings, roles bundle them,
// and anything not listed is denied. Like Presso: the role comes from the database
// (public.my_role), and row-level security still guards the data underneath.

export const ROLES = ["owner", "member", "seeker"] as const;
export type Role = (typeof ROLES)[number];

export type Permission = "crm:use" | "money:use" | "team:manage" | "jobs:use" | "grow:use";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ["crm:use", "money:use", "team:manage", "jobs:use", "grow:use"],
  member: ["crm:use", "jobs:use", "grow:use"],
  seeker: ["jobs:use", "grow:use"],
};

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", member: "Sales member", seeker: "Job seeker" };

// Longest match wins. "open" pages need only a sign-in.
const ROUTES: [string, Permission | "open"][] = [
  ["/deals", "crm:use"],
  ["/forecast", "crm:use"],
  ["/activity", "crm:use"],
  ["/contacts", "crm:use"],
  ["/overview", "money:use"],
  ["/payments", "money:use"],
  ["/subscriptions", "money:use"],
  ["/integrations", "money:use"],
  ["/team", "team:manage"],
  ["/jobs", "jobs:use"],
  ["/applications", "jobs:use"],
  ["/apply", "jobs:use"],
  ["/outbox", "jobs:use"],
  ["/freelance", "jobs:use"],
  ["/profile", "jobs:use"],
  ["/scholarships", "grow:use"],
  ["/documents", "grow:use"],
  ["/goals", "grow:use"],
  ["/plans", "grow:use"],
  ["/help", "open"],
  ["/share-target", "jobs:use"],
  ["/login", "open"],
  ["/auth", "open"],
];

export const can = (role: Role, p: Permission) => ROLE_PERMISSIONS[role].includes(p);

// The permission a page needs. "/" is Companies. Unknown pages need the owner (deny by default).
export function permissionFor(pathname: string): Permission | "open" {
  if (pathname === "/") return "crm:use";
  const hit = ROUTES.filter(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)).sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? hit[1] : "team:manage";
}

export function allowed(role: Role, pathname: string): boolean {
  const p = permissionFor(pathname);
  return p === "open" || can(role, p);
}

// Where each role lands after sign-in or a page it can't open.
export const homeFor = (role: Role) => (can(role, "crm:use") ? "/" : "/jobs");

export const asRole = (v: unknown): Role => (ROLES.includes(v as Role) ? (v as Role) : "seeker");
