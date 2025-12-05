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

import {
  constructWebsocketUrl,
  decryptPayload,
  websocketDataSchema,
} from "./utils";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

describe("constructWebsocketUrl", () => {
  it("should construct correct WebSocket URL for QEMU VM", () => {
    const url = constructWebsocketUrl({
      host: "pve01.example.com",
      node: "pve01",
      vmid: 1000,
      type: "qemu",
      port: 5900,
      vncticket: "test-ticket-123",
    });

    expect(url.protocol).toBe("wss:");
    expect(url.hostname).toBe("pve01.example.com");
    expect(url.pathname).toBe("/api2/json/nodes/pve01/qemu/1000/vncwebsocket");
    expect(url.searchParams.get("port")).toBe("5900");
    expect(url.searchParams.get("vncticket")).toBe("test-ticket-123");
  });

  it("should construct correct WebSocket URL for LXC container", () => {
    const url = constructWebsocketUrl({
      host: "pve02.example.com",
      node: "pve02",
      vmid: 2000,
      type: "lxc",
      port: "5901",
      vncticket: "test-ticket-456",
    });

    expect(url.protocol).toBe("wss:");
    expect(url.hostname).toBe("pve02.example.com");
    expect(url.pathname).toBe("/api2/json/nodes/pve02/lxc/2000/vncwebsocket");
    expect(url.searchParams.get("port")).toBe("5901");
    expect(url.searchParams.get("vncticket")).toBe("test-ticket-456");
  });

  it("should handle numeric port as string", () => {
    const url = constructWebsocketUrl({
      host: "pve01.example.com",
      node: "pve01",
      vmid: 1000,
      type: "qemu",
      port: 5900,
      vncticket: "test-ticket",
    });

    expect(url.searchParams.get("port")).toBe("5900");
  });
});

describe("websocketDataSchema", () => {
  it("should validate correct QEMU VM data", async () => {
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

  it("should validate correct LXC container data", async () => {
    const validData = {
      vmid: 2000,
      type: "lxc",
      host: "pve02.example.com",
      node: "pve02",
      ticket: "PVEAuthCookie=test-cookie",
      vncticket: "vnc-ticket-456",
      port: "5901",
    };

    const result = await websocketDataSchema.parseAsync(validData);
    expect(result.port).toBe("5901");
  });

  it("should reject invalid VM ID", async () => {
    const invalidData = {
      vmid: -1,
      type: "qemu",
      host: "pve01.example.com",
      node: "pve01",
      ticket: "PVEAPIToken=test",
      vncticket: "vnc-ticket",
      port: 5900,
    };

    expect(websocketDataSchema.parseAsync(invalidData)).rejects.toThrow();
  });

  it("should reject invalid type", async () => {
    const invalidData = {
      vmid: 1000,
      type: "invalid",
      host: "pve01.example.com",
      node: "pve01",
      ticket: "PVEAPIToken=test",
      vncticket: "vnc-ticket",
      port: 5900,
    };

    expect(websocketDataSchema.parseAsync(invalidData)).rejects.toThrow();
  });

  it("should reject invalid hostname", async () => {
    const invalidData = {
      vmid: 1000,
      type: "qemu",
      host: "not a valid hostname",
      node: "pve01",
      ticket: "PVEAPIToken=test",
      vncticket: "vnc-ticket",
      port: 5900,
    };

    expect(websocketDataSchema.parseAsync(invalidData)).rejects.toThrow();
  });

  it("should reject missing required fields", async () => {
    const invalidData = {
      vmid: 1000,
      type: "qemu",
      // Missing host, node, ticket, etc.
    };

    expect(websocketDataSchema.parseAsync(invalidData)).rejects.toThrow();
  });
});

describe("decryptPayload", () => {
  const originalKey = process.env.SIGNATURE_KEY;

  beforeAll(() => {
    // Set a test key for encryption/decryption tests
    process.env.SIGNATURE_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterAll(() => {
    // Restore original key
    if (originalKey) {
      process.env.SIGNATURE_KEY = originalKey;
    } else {
      delete process.env.SIGNATURE_KEY;
    }
  });

  it("should decrypt a valid encrypted payload", async () => {
    // Create a test payload
    const plaintext = JSON.stringify({
      vmid: 1000,
      type: "qemu",
      host: "pve01.example.com",
      node: "pve01",
      ticket: "PVEAPIToken=test",
      vncticket: "vnc-ticket",
      port: 5900,
    });

    // Encrypt the payload
    const signatureKey = process.env.SIGNATURE_KEY;
    if (!signatureKey) {
      throw new Error("SIGNATURE_KEY is not set");
    }

    const iv = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
      "raw",
      Buffer.from(signatureKey, "hex"),
      {
        name: "AES-CBC",
        length: 256,
      },
      true,
      ["encrypt"],
    );

    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-CBC",
        iv,
      },
      key,
      new TextEncoder().encode(plaintext),
    );

    const ivHex = Buffer.from(iv).toString("hex");
    const encryptedHex = Buffer.from(encrypted).toString("hex");
    const payload = `${ivHex}:${encryptedHex}`;

    // Decrypt and verify
    const decrypted = await decryptPayload(payload);
    expect(decrypted).toBe(plaintext);
  });

  it("should throw error for malformed payload", async () => {
    expect(decryptPayload("invalid-payload")).rejects.toThrow(
      "Payload is malformed",
    );
  });

  it("should throw error for payload without colon separator", async () => {
    expect(decryptPayload("no-colon-here")).rejects.toThrow(
      "Payload is malformed",
    );
  });

  it("should throw error when SIGNATURE_KEY is not set", async () => {
    const originalKey = process.env.SIGNATURE_KEY;
    delete process.env.SIGNATURE_KEY;

    expect(decryptPayload("iv:encrypted")).rejects.toThrow(
      "SIGNATURE_KEY environment variable is not set",
    );

    if (originalKey) {
      process.env.SIGNATURE_KEY = originalKey;
    }
  });
});
