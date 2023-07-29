import express from "express";
import {
  MATCH_STATE,
  RWG_EVENT,
  RwgConfig,
  RwgGame,
  CONTROL_TYPE,
  ControlEvent,
} from "@OlliePugh/rwg-game";
import { Server as SocketServer } from "socket.io";

import cors from "cors";
import { SerialPort } from "serialport";
import http from "http";

const serialport = new SerialPort({
  path: "COM7",
  baudRate: 115200,
});

serialport.on("data", (data) => {
  console.log("Received serial data:", data.toString());
});

serialport.on("error", (err) => {
  console.error("Serial port error:", err.message);
});

serialport.on("open", () => {
  console.log("Serial port opened");
});

const SERIAL_EVENT_KEYS = {
  CONTROL: 0x01,
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
      position: {
        x: 0.5,
        y: 0.8,
      },
      displayOnDesktop: true,
      size: 0.5,
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
    {
      id: "car2",
      onControl: (eventData) => {
        onControl(eventData, false);
      },
      stream: {
        address: "https://stream.ollieq.co.uk/janus",
        id: 2,
        port: 8005,
      },
    },
  ],
};

const gameServer = new RwgGame(gameConfig, httpServer, app, io);
gameServer.on(RWG_EVENT.MATCH_STATE_CHANGE, (newState) => {
  if (
    newState == MATCH_STATE.COMPLETED ||
    newState == MATCH_STATE.WAITING_FOR_PLAYERS
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

const onControl = async (
  controlEvent: ControlEvent | ControlEvent[],
  isPlayer1: boolean
) => {
  const controls: ControlEvent[] = Array.isArray(controlEvent)
    ? controlEvent
    : [controlEvent];

  controls.forEach((control) => {
    if (control.controlName == "control-slider") {
      const buffer = Buffer.alloc(3);
      buffer[0] = SERIAL_EVENT_KEYS.CONTROL + +!isPlayer1; // add one if not player1
      buffer[1] = new Uint8Array([control.value])[0];
      buffer[2] = SERIAL_EVENT_KEYS.FINISH_MESSAGE;

      serialport.write(buffer);
    }
  });
};

httpServer.listen(80, () => {
  console.log("Server Started");
});
