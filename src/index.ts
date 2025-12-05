/*
Copyright 2025 Janic Bellmann.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import z4 from "zod/v4";

import {
  constructWebsocketUrl,
  decryptPayload,
  type WebSocketData,
  websocketDataSchema,
} from "./utils";

const PORT = process.env.PORT || 8443;

const sockets = new Map<number, WebSocket>();

Bun.serve({
  port: PORT,
  routes: {
    "/api/status": {
      GET: () => {
        return Response.json({
          uptime: Math.round(Bun.nanoseconds() / 1e9),
        });
      },
    },
  },
  async fetch(request, server) {
    if (request.method !== "GET") {
      return Response.json(
        {
          error: "Method not allowed. Supported methods: GET",
          code: 405,
          issues: [],
        },
        { status: 405 },
      );
    }

    try {
      const params = new URL(request.url).searchParams;
      const encryptedPayload = params.get("payload");

      if (!encryptedPayload) {
        return Response.json(
          {
            error: "Missing payload",
            code: 400,
            issues: [],
          },
          { status: 400 },
        );
      }

      const decryptedPayload = await decryptPayload(encryptedPayload);
      const json = JSON.parse(decryptedPayload);

      const data = await websocketDataSchema.parseAsync(json);

      server.upgrade(request, { data });

      return undefined;
    } catch (error) {
      // Prevent any crashes and hide the error to the client
      console.error(
        `An error occurred while trying to process a request:`,
        error,
      );

      if (error instanceof z4.ZodError) {
        return Response.json(
          {
            error: "Invalid payload",
            code: 400,
            issues: error.issues,
          },
          { status: 400 },
        );
      }

      return Response.json(
        {
          error: "Internal server error",
          code: 500,
          issues: [],
        },
        { status: 500 },
      );
    }
  },
  websocket: {
    perMessageDeflate: false,
    sendPings: false,
    data: {} as WebSocketData,
    message(ws, message) {
      const socket = sockets.get(ws.data.vmid);
      if (!socket) {
        console.error(
          `Received a message for VM ${ws.data.vmid} but no socket found. This should not happen.`,
        );
        ws.close(1011, "Upstream websocket not found");
        return;
      }

      // Forward the message to the upstream websocket
      socket.send(message);
    },
    async open(ws) {
      const { ticket, ...data } = ws.data;
      const url = constructWebsocketUrl(data);

      const headers = ticket.startsWith("PVEAPIToken=")
        ? {
            authorization: ticket,
          }
        : {
            authorization: `PVEAuthCookie=${ticket}`,
          };

      const pws = new WebSocket(url, { headers });

      pws.addEventListener("open", () => {
        sockets.set(ws.data.vmid, pws);
      });
      pws.addEventListener("message", ({ data }) => {
        ws.send(data);
      });
      pws.addEventListener("error", () => {
        ws.close(1011, "Upstream websocket error");
      });
      pws.addEventListener("close", ({ code }) => {
        ws.close(code, "Upstream websocket closed");
      });
    },
    close(ws, code, reason) {
      const socket = sockets.get(ws.data.vmid);
      if (socket) {
        // Socket may already be closed
        socket.close(code, reason);
        sockets.delete(ws.data.vmid);
      }
    },
  },
});

console.log(`> Server is running on port ${PORT}`);
