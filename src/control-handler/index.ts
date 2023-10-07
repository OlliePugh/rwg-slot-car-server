import { ControlEvent } from "@OlliePugh/rwg-game";
import { EVENTS, eventEmitter } from "../event-listener";
import { writeSpeed } from "../serial-handler";
import { speedBans } from "../globals";

const onControl = async (
  controlEvent: ControlEvent | ControlEvent[],
  isPlayer1: boolean
) => {
  const controls: ControlEvent[] = Array.isArray(controlEvent)
    ? controlEvent
    : [controlEvent];
  const playerIndex = isPlayer1 ? 0 : 1;

  controls.forEach((control) => {
    if (control.controlName == "control-slider") {
      speedBans[isPlayer1 ? 0 : 1].lastRecordedSpeed = control.value; // save this incase this exceeds the threshold
      if (speedBans[playerIndex].currentTimeout == null) {
        // write if the player is not currently speed banned
        writeSpeed(control.value, isPlayer1);
      }
    }
  });
};

eventEmitter.on(EVENTS.CONTROL, onControl);
