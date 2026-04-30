/**
 * Calculates completed years of age from an ISO YYYY-MM-DD birth date
 * relative to a given reference date (also YYYY-MM-DD).
 */
export function calculateAge(dob: string, today: string): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) {
    age--;
  }
  return age;
}
