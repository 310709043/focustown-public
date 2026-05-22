/**
 * Compact 6-char display code derived from a user id. Used by the
 * Profile sidebar and the public CitizenIdCard so the two surfaces
 * agree on what citizens see as their "NO." identifier.
 */
export function shortCode(id: string): string {
  if (!id) return "------";
  const clean = id.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (clean.slice(0, 4) + clean.slice(-2)).padEnd(6, "0");
}
