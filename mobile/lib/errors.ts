/**
 * True when a Supabase error means the device never reached the server, rather
 * than the server rejecting the request.
 *
 * postgrest-js does not throw on a failed fetch — it returns an ordinary
 * `{ error }` result with an empty `code` and a message of "<name>: <message>",
 * which on React Native is "TypeError: Network request failed". Every error that
 * actually came back from PostgREST or Postgres carries a code (a SQLSTATE, or
 * PGRST***), so an empty code plus a fetch-shaped message is the reliable
 * signal. Aborts are counted too: from the cashier's side, a request that never
 * arrives is the same problem as one that never left.
 *
 * This matters because the two need opposite handling. A coded error means the
 * server is reachable and something specific went wrong, so retrying or
 * overriding can work. A connection error means nothing will succeed until the
 * network is back, and offering an override just produces a second failure with
 * the wrong explanation attached to it.
 */
export function isConnectionError(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code) return false;
  return /fetch|network|timeout|abort|connection/i.test(error.message ?? "");
}

/** Shown wherever a write could not even be attempted. */
export const NO_CONNECTION = "Tidak ada koneksi internet. Periksa jaringan Anda.";
