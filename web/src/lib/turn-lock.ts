export const TURN_LOCK_SECONDS = 90;

export type TurnLock = {
  by: string | null;
  until: string | null;
  active: boolean;
};

export function buildTurnLock(
  lockedBy: string | null | undefined,
  lockedUntil: string | null | undefined,
  now: Date = new Date()
): TurnLock {
  const until = lockedUntil ?? null;
  const active =
    Boolean(lockedBy && until) && new Date(until).getTime() > now.getTime();
  return {
    by: lockedBy ?? null,
    until,
    active,
  };
}

export function turnLockExpiryIso(now: Date = new Date()): string {
  return new Date(now.getTime() + TURN_LOCK_SECONDS * 1000).toISOString();
}
