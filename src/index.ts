import express from "express";
import {
  MATCH_STATE,
  RWG_EVENT,
  RwgConfig,
  RwgGame,
  CONTROL_TYPE,
  ControlEvent,
  Match,
  ELEMENT_TYPE,
} from "@OlliePugh/rwg-game";
import { Server as SocketServer } from "socket.io";

import cors from "cors";
import { SerialPort } from "serialport";
import http from "http";

const serialport = new SerialPort({
  path: "COM7",
  baudRate: 115200,
});

interface Cooldown {
  currentTimeout?: ReturnType<typeof setTimeout>;
  lastRecordedSpeed?: number;
}

const SLOW_DOWN_LENGTH = 3; // seconds
const SPEED_BAN_SPEED = 0;

let receivedData = Buffer.alloc(0); // Buffer to store incoming data
const speedBans: Cooldown[] = [{}, {}];
let currentMatch: Match;

serialport.on("data", (data: any) => {
  // Concatenate the received data with the existing buffer
  receivedData = Buffer.concat([receivedData, data]);
  // Check if the end byte (0x0d) is present in the received data
  const endByteIndex = receivedData.indexOf(0x0d);

  // If the end byte is found, process the complete message
  if (endByteIndex !== -1) {
    const completeMessage = receivedData.slice(0, endByteIndex + 1);
    processMessage(completeMessage);

    // Remove the processed message from the buffer
    receivedData = receivedData.slice(endByteIndex + 1);
  }
});

const speedViolationCleared = (playerIndex: number) => {
  delete speedBans[playerIndex].currentTimeout;
  if (speedBans[playerIndex].lastRecordedSpeed != null) {
    writeSpeed(speedBans[playerIndex].lastRecordedSpeed!, playerIndex == 0);
  }
};

const commitSpeedViolation = (playerIndex: number) => {
  emitSpeedViolationMessage(SLOW_DOWN_LENGTH, playerIndex);
  writeSpeed(SPEED_BAN_SPEED, playerIndex == 0);
};

const emitSpeedViolationMessage = (
  secondsRemaining: number,
  playerIndex: number
) => {
  let message =
    secondsRemaining === 0
      ? ""
      : `VIRTUAL SPIN OFF!\nRegain controls in ${secondsRemaining}`;

  currentMatch.getPlayers()[playerIndex].updateUserInterface({
    "speed-violation-text": {
      extraData: {
        message,
      },
    },
  });

  if (secondsRemaining-- > 0) {
    speedBans[playerIndex].currentTimeout = setTimeout(() => {
      emitSpeedViolationMessage(secondsRemaining, playerIndex);
    }, 1000);
  }

  if (secondsRemaining == -1) {
    // the penalty has been cleared
    speedViolationCleared(playerIndex);
  }
};

const processMessage = (message: Uint8Array) => {
  const isPlayer1 = message[0] % 2 == 1;
  const playerIndex = isPlayer1 ? 0 : 1;
  const event = message[0] - playerIndex;
  switch (event) {
    case SERIAL_EVENT_KEYS.SPEED_VIOLATION:
      if (speedBans[playerIndex].currentTimeout == undefined) {
        commitSpeedViolation(playerIndex);
      }

      console.log(`speed violation for player ${isPlayer1 ? 1 : 2}`);
      break;

    case SERIAL_EVENT_KEYS.CAR_DISMOUNT:
      // Handle CAR_DISMOUNT message
      break;

    case SERIAL_EVENT_KEYS.LAP_COMPLETE:
      console.log("lap complete");
      break;

    default:
      console.log(`Unknown event key ${message[0]}`);
      break;
  }
};

serialport.on("error", (err: any) => {
  console.error("Serial port error:", err.message);
});

serialport.on("open", () => {
  console.log("Serial port opened");
});

const SERIAL_EVENT_KEYS = {
  CONTROL: 0x01,
  SPEED_VIOLATION: 0x03,
  CAR_DISMOUNT: 0x05,
  LAP_COMPLETE: 0x07,
  FINISH_MESSAGE: 0x0d,
};

const app = express();

app.use(
  cors({
    origin: "https://play.ollieq.co.uk",
  })
);

const httpServer = http.createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: "https://play.ollieq.co.uk",
  },
});

const gameConfig: RwgConfig = {
  id: "racing-cars",
  queueServer: "https://queue.ollieq.co.uk",
  description: "Race remote control cars from somewhere in the world!",
  name: "Online Remote Control Car Racing",
  authenticationRequired: false,
  // timeLimit: 10,
  userInterface: [
    {
      id: "control-slider",
      type: CONTROL_TYPE.SLIDER,
      control: [
        {
          id: "control-slider",
          inputMap: [],
        },
      ],
      rateLimit: 10,
      position: {
        x: 0.5,
        y: 0.8,
      },
      displayOnDesktop: true,
      size: 0.5,
    },
    {
      id: "speed-violation-text",
      type: ELEMENT_TYPE.text,
      position: {
        x: 0.1,
        y: 0.1,
      },
      displayOnDesktop: true,
      size: 1,
      extraData: { message: "" },
    },
  ],
  countdownSeconds: 0,
  controllables: [
    {
      id: "car1",
      onControl: (eventData) => {
        onControl(eventData, true);
      },
      stream: {
        address: "stream.ollieq.co.uk",
        id: 1,
        port: 8004,
      },
    },
    // {
    //   id: "car2",
    //   onControl: (eventData) => {
    //     onControl(eventData, false);
    //   },
    //   stream: {
    //     address: "https://stream.ollieq.co.uk/janus",
    //     id: 2,
    //     port: 8005,
    //   },
    // },
  ],
};

const gameServer = new RwgGame(gameConfig, httpServer, app, io);

gameServer.on(RWG_EVENT.MATCH_STATE_CHANGE, (newState, match) => {
  if (newState === MATCH_STATE.COUNTDOWN) {
    currentMatch = match;
  }
  if (
    newState === MATCH_STATE.COMPLETED ||
    newState === MATCH_STATE.WAITING_FOR_PLAYERS
  ) {
    const buffer = Buffer.alloc(6); // stop the cars
    buffer[0] = SERIAL_EVENT_KEYS.CONTROL;
    buffer[1] = 0x00;
    buffer[2] = SERIAL_EVENT_KEYS.FINISH_MESSAGE;
    buffer[3] = SERIAL_EVENT_KEYS.CONTROL + 1;
    buffer[4] = 0x00;
    buffer[5] = SERIAL_EVENT_KEYS.FINISH_MESSAGE;
    serialport.write(buffer);
  }
});

const writeSpeed = (value: number, isPlayer1: boolean) => {
  const buffer = Buffer.alloc(3);
  buffer[0] = SERIAL_EVENT_KEYS.CONTROL + +!isPlayer1; // add one if not player1
  buffer[1] = new Uint8Array([value])[0];
  buffer[2] = SERIAL_EVENT_KEYS.FINISH_MESSAGE;
  serialport.write(buffer);
};

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

httpServer.listen(80, () => {
  console.log("Server Started");
});
