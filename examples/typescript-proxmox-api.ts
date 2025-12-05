/**
 * The following example demonstrates how to get the noVNC console URL
 * using the Proxmox API and the proxxy server in TypeScript.
 *
 * This code could be used on your backend.
 * After creating the noVNC console URL, you can redirect the user to the URL.
 *
 * It is also possible to create an iframe that loads the noVNC console URL.
 */

import proxmoxApi, { ProxmoxEngine } from "proxmox-api";

import type { WebSocketData } from "../src/utils";

// Change this to the URL where you deployed the VNC proxy
const PROXXY_DEPLOYMENT_URL =
  process.env.PROXXY_DEPLOYMENT_URL || "novnc.example.com";

// Change this to the port where you deployed the VNC proxy
const PROXXY_PORT = process.env.PROXXY_PORT || "8443";

// Change this to the shared signature key of the VNC proxy
const SIGNATURE_KEY = process.env.SIGNATURE_KEY || "";

/**
 * Constructs a noVNC URL that can be used
 * to access a VNC session.
 *
 * @returns An accessible noVNC URL
 */
const constructVNCUrl = ({
  password,
  payload,
}: {
  password: string;
  payload: string;
}): string => {
  // Here we use the noVNC default URL,
  // but you can use your own implementation if you want or host it yourself
  const url = new URL("https://novnc.com/noVNC/vnc.html");
  url.searchParams.set("host", PROXXY_DEPLOYMENT_URL);
  url.searchParams.set("port", PROXXY_PORT);
  url.searchParams.set("password", password);
  url.searchParams.set("path", `?payload=${payload}`);
  url.searchParams.set("encrypt", "true");
  url.searchParams.set("resize", "scale");
  url.searchParams.set("autoconnect", "true");
  return url.toString();
};

/**
 * Encrypts a string payload using AES-256-CBC encryption.
 *
 * The output will be in the format:
 * <iv>:<encrypted>
 *
 * The iv is a 16 byte hex string.
 * The encrypted is a hex string.
 *
 * The key is the SIGNATURE_KEY environment variable.
 *
 * The key is a base64 encoded string.
 *
 * @param payload - The plaintext payload to encrypt
 * @returns The encrypted payload as a string
 */
export const encryptPayload = async (payload: string): Promise<string> => {
  // Generate a random 16-byte IV
  const iv = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(SIGNATURE_KEY, "hex"),
    {
      name: "AES-CBC",
      length: 256,
    },
    true,
    ["encrypt"],
  );

  const encodedPayload = new TextEncoder().encode(payload);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-CBC",
      iv,
    },
    key,
    encodedPayload,
  );

  // Convert iv and encrypted buffer to hex
  const ivHex = Buffer.from(iv).toString("hex");
  const encryptedHex = Buffer.from(encryptedBuffer).toString("hex");

  return `${ivHex}:${encryptedHex}`;
};

/**
 * Gets the noVNC console URL using the Proxmox API and
 * the proxxy server.
 *
 * @returns The accessible noVNC console URL
 */
const getConsoleUrl = async ({
  nodeName,
  vmid,
  type,
  host,
  tokenID,
  tokenSecret,
}: {
  nodeName: string;
  vmid: number;
  type: "qemu" | "lxc";
  host: string;
  tokenID: string;
  tokenSecret: string;
}): Promise<string> => {
  // Construct a new ProxmoxEngine instance with the node credentials
  const engine = new ProxmoxEngine({
    host,
    tokenID,
    tokenSecret,
  });

  // Create a new Proxmox API client
  const proxmox = proxmoxApi(engine);

  const node = proxmox.nodes.$(nodeName);
  const vm = node[type].$(vmid);

  // Get the ticket and VNC proxy information asynchronously
  const [ticket, vncproxy] = await Promise.all([
    engine.getTicket().then((res) => res.ticket),
    vm.vncproxy.$post({
      // Prepare to open the websocket
      // This is required otherwise you won't get a stable connection
      websocket: true,
      // Generate a random password that can be used to access
      // the VNC session instead of the API token
      "generate-password": true,
    }),
  ]);

  // Serialize the payload to a JSON string
  // This must be the same format as the proxy accepts
  const rawPayload = JSON.stringify({
    vmid,
    type,
    host,
    node: nodeName,
    ticket, // Ticket is either PVEAPIToken=<token> or the value of the PVEAuthCookie cookie
    vncticket: vncproxy.vncticket,
    port: vncproxy.port,
  } satisfies WebSocketData);

  // Encrypt the payload using the shared signature key
  const encryptedPayload = await encryptPayload(rawPayload);

  // Construct the noVNC URL
  const url = constructVNCUrl({
    password: vncproxy.password as string,
    payload: encryptedPayload,
  });

  return url;
};

/**
 * Main function that demonstrates how to get the noVNC console URL
 * using the Proxmox API and the proxxy server.
 */
async function main(): Promise<void> {
  // Dummy data, replace with your own
  const nodeName = "pve01";
  const vmid = 1000;
  const type = "qemu";
  const host = "pve01.example.com";
  const tokenID = "1234567890";
  const tokenSecret = "1234567890";

  try {
    // Try to construct the console URL
    const url = await getConsoleUrl({
      nodeName,
      vmid,
      type,
      host,
      tokenID,
      tokenSecret,
    });

    console.log(
      "The noVNC console URL is (copy and paste it into your browser to test):",
      url,
    );
  } catch (error) {
    console.error(`Failed to get the noVNC console URL:`, error);
    process.exit(1);
  }
}

main();
