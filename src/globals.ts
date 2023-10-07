interface Cooldown {
  currentTimeout?: ReturnType<typeof setTimeout>;
  lastRecordedSpeed?: number;
}

export const SLOW_DOWN_LENGTH = 3; // seconds
export const SPEED_BAN_SPEED = 10;
export const speedBans: Cooldown[] = [{}, {}];
export const lapCounter = [1, 1];
