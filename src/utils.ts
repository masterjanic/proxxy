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

export const websocketDataSchema = z4.object({
  /**
   * The VM ID of the guest in Proxmox VE.
   *
   * @example 1000
   */
  vmid: z4.int().positive(),
  /**
   * The type of the guest in Proxmox VE.
   * Either "qemu" or "lxc".
   *
   * @example "qemu"
   * @example "lxc"
   */
  type: z4.enum(["qemu", "lxc"]),
  /**
   * The FQDN of the Proxmox VE server, where the API is reachable.
   * It is assumed that HTTPS protocol is used.
   *
   * @example "pve01.example.com"
   */
  host: z4.hostname(),
  /**
   * The name of the node in Proxmox VE.
   * This is equal to the hostname of the node.
   *
   * @example "pve01"
   */
  node: z4.hostname(),
  /**
   * The ticket to authenticate the API request with.
   * This can either be an API token or the value of the PVEAuthCookie cookie.
   *
   * @example "PVEAPIToken=1234567890"
   */
  ticket: z4.string(),
  /**
   * The ticket to authenticate the VNC websocket request with.
   * This value is obtained from POST /api2/json/nodes/{node}/qemu/{vmid}/vncproxy
   */
  vncticket: z4.string(),
  /**
   * The port number of the VNC proxy.
   * This value is obtained from POST /api2/json/nodes/{node}/qemu/{vmid}/vncproxy
   *
   * @example 5900
   * @example "5900"
   */
  port: z4.union([z4.string(), z4.number()]),
});

export type WebSocketData = z4.infer<typeof websocketDataSchema>;

/**
 * Constructs a websocket URL (wss://) for a given Proxmox VE server and VM.
 * The URL can be used to the noVNC websocket endpoint of Proxmox VE.
 *
 * @returns The constructed websocket URL
 */
export const constructWebsocketUrl = ({
  host,
  node,
  vmid,
  type,
  port,
  vncticket,
}: Pick<WebSocketData, "host" | "node" | "vmid" | "type"> & {
  port: number | string;
  vncticket: string;
}): URL => {
  const url = new URL(`wss://${host}`);
  url.pathname = `/api2/json/nodes/${node}/${type}/${vmid}/vncwebsocket`;
  url.searchParams.set("port", `${port}`);
  url.searchParams.set("vncticket", vncticket);

  return url;
};

/**
 * Decrypts a string payload using AES-256-CBC encryption.
 *
 * The payload is expected to be in the format:
 * <iv>:<encrypted>
 *
 * The iv is a 16 byte hex string.
 * The encrypted is a hex string.
 *
 * The key is the SIGNATURE_KEY environment variable.
 *
 * The key is a base64 encoded string.
 *
 * @param payload - The encrypted payload to decrypt
 * @returns The decrypted payload as a string
 */
export const decryptPayload = async (payload: string): Promise<string> => {
  const [ivHex, encryptedHex] = payload.split(":");

  if (!ivHex || !encryptedHex) {
    throw new Error("Payload is malformed");
  }

  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const SIGNATURE_KEY = process.env.SIGNATURE_KEY;
  if (!SIGNATURE_KEY) {
    throw new Error("SIGNATURE_KEY environment variable is not set");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(SIGNATURE_KEY, "hex"),
    {
      name: "AES-CBC",
      length: 256,
    },
    true,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-CBC",
      iv,
    },
    key,
    encrypted,
  );

  return new TextDecoder().decode(decrypted);
};
