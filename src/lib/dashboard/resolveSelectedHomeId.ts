/** Pick a valid home id from query param or default to the first accessible home. */
export function resolveSelectedHomeId(
  requestedHomeId: string | undefined,
  homes: { id: string }[],
): string {
  if (
    requestedHomeId &&
    homes.some((home) => home.id === requestedHomeId)
  ) {
    return requestedHomeId;
  }
  return homes[0]?.id ?? "";
}
