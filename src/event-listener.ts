import { EventEmitter } from "stream";

export enum EVENTS {
  LAP_UPDATE = "lap_update",
  CONTROL = "control",
  SPEEDING_VIOLATION = "speed_violation",
  VIOLATED_CLEARED = "violation_cleared",
  DIAGNOSTIC = "diagnostic",
  AUTONOMOUS_TOGGLE = "autonomous_toggle",
}

export const eventEmitter = new EventEmitter();
