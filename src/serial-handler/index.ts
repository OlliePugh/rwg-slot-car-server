import { SerialPort } from "serialport";
import { EVENTS, eventEmitter } from "../event-listener";
import { SLOW_DOWN_LENGTH, SPEED_BAN_SPEED, speedBans } from "../globals";

const serialPort = new SerialPort({
  path: "COM14",
  baudRate: 115200,
});

const SERIAL_EVENT_KEYS = {
  CONTROL: 0x01,
  SPEED_VIOLATION: 0x03,
  CAR_DISMOUNT: 0x05,
  LAP_COMPLETE: 0x07,
  DIAGNOSTIC: 0x09,
  FINISH_MESSAGE: 0x0a,
};

let receivedData = Buffer.alloc(0); // Buffer to store incoming data

// eslint-disable-next-line @typescript-eslint/no-explicit-any
serialPort.on("error", (err: any) => {
  console.error("Serial port error:", err.message);
});

serialPort.on("open", () => {
  console.log("Serial port opened");
});

export const stopCars = () => {
  const buffer = Buffer.alloc(6); // stop the cars
  buffer[0] = SERIAL_EVENT_KEYS.CONTROL;
  buffer[1] = 0x00;
  buffer[2] = SERIAL_EVENT_KEYS.FINISH_MESSAGE;
  buffer[3] = SERIAL_EVENT_KEYS.CONTROL + 1;
  buffer[4] = 0x00;
  buffer[5] = SERIAL_EVENT_KEYS.FINISH_MESSAGE;
  serialPort.write(buffer);
};

const processMessage = (message: Uint8Array) => {
  const isPlayer1 = message[0] % 2 == 1;
  const playerIndex = isPlayer1 ? 0 : 1;
  const event = message[0] - playerIndex;
  switch (event) {
    case SERIAL_EVENT_KEYS.SPEED_VIOLATION:
      if (speedBans[playerIndex].currentTimeout == undefined) {
        eventEmitter.emit(
          EVENTS.SPEEDING_VIOLATION,
          playerIndex,
          SLOW_DOWN_LENGTH
        );
        commitSpeedViolation(playerIndex);
      }
      break;

    case SERIAL_EVENT_KEYS.CAR_DISMOUNT:
      console.log("car has derailed");
      break;

    case SERIAL_EVENT_KEYS.LAP_COMPLETE:
      eventEmitter.emit(EVENTS.LAP_UPDATE, playerIndex);
      break;
    case SERIAL_EVENT_KEYS.DIAGNOSTIC:
      // console.log(JSON.parse(new TextDecoder().decode(message)));
      break;
    default:
      console.log(`Unknown event key ${message[0]}`);
      console.log(new TextDecoder().decode(message));
      break;
  }
};

export const writeSpeed = (value: number, isPlayer1: boolean) => {
  const buffer = Buffer.alloc(3);
  buffer[0] = SERIAL_EVENT_KEYS.CONTROL + +!isPlayer1; // add one if not player1
  buffer[1] = new Uint8Array([value])[0];
  buffer[2] = SERIAL_EVENT_KEYS.FINISH_MESSAGE;
  serialPort.write(buffer);
};

serialPort.on("data", (data: Buffer) => {
  // Concatenate the received data with the existing buffer
  receivedData = Buffer.concat([receivedData, data]);

  while (receivedData.length > 0) {
    // Check if the end byte (0x0a) is present in the received data
    const endByteIndex = receivedData.indexOf(SERIAL_EVENT_KEYS.FINISH_MESSAGE);

    // If the end byte is found, process the complete message
    if (endByteIndex !== -1) {
      const completeMessage = receivedData.slice(0, endByteIndex + 1);
      processMessage(completeMessage);

      // Remove the processed message from the buffer
      receivedData = receivedData.slice(endByteIndex + 1);
    } else {
      // No more complete messages to process, exit the loop for now
      break;
    }
  }
});

const speedViolationCleared = (playerIndex: number) => {
  delete speedBans[playerIndex].currentTimeout;
  if (speedBans[playerIndex].lastRecordedSpeed != null) {
    writeSpeed(speedBans[playerIndex].lastRecordedSpeed!, playerIndex == 0);
  }
};

const commitSpeedViolation = (playerIndex: number) => {
  writeSpeed(SPEED_BAN_SPEED, playerIndex == 0);
};

eventEmitter.on(EVENTS.VIOLATED_CLEARED, speedViolationCleared);
eventEmitter.on(EVENTS.SPEEDING_VIOLATION, commitSpeedViolation);
