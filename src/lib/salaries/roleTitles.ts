export const STAFF_ROLE_TITLES = [
  "Nurse",
  "Care taker",
  "Kitchen Staff",
] as const;

export type StaffRoleTitle = (typeof STAFF_ROLE_TITLES)[number];

export function isStaffRoleTitle(value: string): value is StaffRoleTitle {
  return (STAFF_ROLE_TITLES as readonly string[]).includes(value);
}
