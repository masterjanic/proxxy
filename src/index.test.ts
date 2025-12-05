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

import { websocketDataSchema } from "./utils";
import { beforeAll, describe, expect, it } from "bun:test";

describe("Server API", () => {
  beforeAll(() => {
    // Set test environment
    process.env.PORT = "8444";
    process.env.SIGNATURE_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("should return status endpoint with uptime", async () => {
    const { server } = await import("./index");

    try {
      const response = await fetch(
        `http://localhost:${process.env.PORT}/api/status`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );

      const data = await response.json();
      expect(data).toHaveProperty("uptime");
      // @ts-expect-error - unknown type
      expect(typeof data.uptime).toBe("number");
      // @ts-expect-error - unknown type
      expect(data.uptime).toBeGreaterThanOrEqual(0);
    } finally {
      server.stop();
    }
  });

  it("should reject non-GET requests", async () => {
    const { server } = await import("./index");

    try {
      const response = await fetch(
        `http://localhost:${process.env.PORT}/test`,
        {
          method: "POST",
        },
      );
      expect(response.status).toBe(405);

      const data = await response.json();
      // @ts-expect-error - unknown type
      expect(data.error).toBe("Method not allowed. Supported methods: GET");
      // @ts-expect-error - unknown type
      expect(data.code).toBe(405);
    } finally {
      server.stop();
    }
  });

  it("should reject requests without payload parameter", async () => {
    const { server } = await import("./index");

    try {
      const response = await fetch(`http://localhost:${process.env.PORT}/test`);
      expect(response.status).toBe(400);

      const data = await response.json();
      // @ts-expect-error - unknown type
      expect(data.error).toBe("Missing payload");
      // @ts-expect-error - unknown type
      expect(data.code).toBe(400);
    } finally {
      server.stop();
    }
  });
});

describe("WebSocket Data Validation", () => {
  it("should validate correct WebSocket data structure", async () => {
    const validData = {
      vmid: 1000,
      type: "qemu" as const,
      host: "pve01.example.com",
      node: "pve01",
      ticket: "PVEAPIToken=test-token",
      vncticket: "vnc-ticket-123",
      port: 5900,
    };

    const result = await websocketDataSchema.parseAsync(validData);
    expect(result).toEqual(validData);
  });

  it("should handle PVEAPIToken format", () => {
    const ticket = "PVEAPIToken=test-token";
    expect(ticket.startsWith("PVEAPIToken=")).toBe(true);
  });

  it("should handle PVEAuthCookie format", () => {
    const ticket = "test-cookie-value";
    const authHeader = `PVEAuthCookie=${ticket}`;
    expect(authHeader).toBe("PVEAuthCookie=test-cookie-value");
  });
});
