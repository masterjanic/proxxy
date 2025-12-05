<h3 align="center">proxxy</h3>

<p align="center">
    A secure WebSocket proxy server for Proxmox VE VNC console access.
    <br />
    <br />
    <br />
    <a href="#introduction"><strong>Introduction</strong></a> ·
    <a href="#deployment"><strong>Deployment</strong></a> ·
    <a href="#examples"><strong>Examples</strong></a> ·
    <a href="#tech-stack"><strong>Tech Stack</strong></a> ·
    <a href="#known-limitations"><strong>Limitations</strong></a> ·
    <a href="#contributing"><strong>Contributing</strong></a> ·
    <a href="#license"><strong>License</strong></a>
</p>

<p align="center">
  <a href="https://github.com/masterjanic/proxxy/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/masterjanic/proxxy?label=license&logo=github&color=f80&logoColor=fff" alt="License" />
  </a>
</p>

## Introduction

Proxxy is a secure WebSocket proxy server that enables remote access to Proxmox VE VNC consoles through encrypted connections. 

It acts as an intermediary between clients (such as noVNC) and Proxmox VE servers, forwarding WebSocket messages bidirectionally while maintaining secure authentication. Proxxy accepts encrypted payloads containing VM connection details, decrypts and validates them, then establishes a direct WebSocket connection to the Proxmox VE server's VNC endpoint. 

This allows you to securely expose VNC console access without directly exposing your Proxmox VE infrastructure to end users.

## Deployment

### Prerequisites

- [Bun](https://bun.sh/) runtime (for direct deployment) or Docker (for containerized deployment)
- A shared `SIGNATURE_KEY` for encrypting/decrypting payloads (must be a hex-encoded string)

### Environment Variables

- `SIGNATURE_KEY` (required): A hex-encoded string used for AES-256-CBC encryption/decryption of payloads. This key must be shared between your backend (that generates the encrypted payloads) and the Proxxy server.
- `PORT` (optional): The port on which the server will listen. Defaults to `8443`.

### Option 1: Docker Deployment

1. Build the Docker image:
   ```bash
   docker build -t proxxy .
   ```

2. Run the container:
   ```bash
   docker run -d \
     -p 8443:8443 \
     -e SIGNATURE_KEY=your_hex_encoded_key_here \
     -e PORT=8443 \
     --name proxxy \
     proxxy
   ```

### Option 2: Docker Compose Deployment

1. Create a `.env` file in the project root:
   ```env
   SIGNATURE_KEY=your_hex_encoded_key_here
   PORT=8443
   ```

2. Start the service:
   ```bash
   docker-compose up -d
   ```

The service will automatically restart on failure and use the environment variables from your `.env` file.

### Option 3: Direct Bun Deployment

1. Install dependencies:
   ```bash
   bun install
   ```

2. Set environment variables and start the server:
   ```bash
   SIGNATURE_KEY=your_hex_encoded_key_here PORT=8443 bun start
   ```

   Or export them first:
   ```bash
   export SIGNATURE_KEY=your_hex_encoded_key_here
   export PORT=8443
   bun start
   ```

### Generating a SIGNATURE_KEY

You can generate a secure hex-encoded key using OpenSSL:

```bash
openssl rand -hex 32
```

Or using Node.js/Bun:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Verifying Deployment

Once deployed, you can verify the server is running by checking the status endpoint:

```bash
curl http://localhost:8443/api/status
```

This should return a JSON response with the server uptime in seconds.

## Examples

Example code demonstrating how to integrate Proxxy with your backend can be found in the [`examples/`](./examples/) directory.

### Available Examples

- **TypeScript/Proxmox API Integration** (`examples/typescript-proxmox-api.ts`): Demonstrates how to generate encrypted payloads and construct noVNC console URLs using the Proxmox API. This example shows:
  - How to authenticate with Proxmox VE using API tokens
  - How to create a VNC proxy session
  - How to encrypt the connection payload using AES-256-CBC
  - How to construct a noVNC URL that connects through Proxxy

This example can be adapted for use in your backend to generate secure VNC console access URLs for your users.

## Tech Stack

Proxxy is built using the following technologies:

- **[Bun](https://bun.sh/)**: JavaScript runtime and server framework used for handling HTTP requests and WebSocket connections
- **[TypeScript](https://www.typescriptlang.org/)**: Type-safe programming language for enhanced code quality and developer experience
- **[Zod](https://zod.dev/) v4**: Schema validation library for runtime type checking and payload validation
- **[Docker](https://www.docker.com/)**: Containerization platform for consistent deployment across environments
- **[Biome](https://biomejs.dev/)**: Fast formatter and linter for code quality assurance
- **[Husky](https://typicode.github.io/husky/)**: Git hooks for automated code quality checks
- **[Commitlint](https://commitlint.js.org/)**: Commit message linting for consistent commit history

The server leverages Bun's native WebSocket support and HTTP server capabilities, providing high-performance bidirectional communication between clients and Proxmox VE servers.

## Known Limitations

The following limitations should be considered when deploying Proxxy:

- **noVNC client support only**: Currently, Proxxy is designed and tested specifically for use with noVNC clients. Other VNC client implementations may not be fully compatible.

- **In-memory WebSocket storage**: All active WebSocket connections are stored in memory using a `Map` data structure. This means:
  - All connections are lost when the server restarts
  - Connections cannot be shared across multiple server instances (no horizontal scaling)
  - Memory usage grows with the number of concurrent connections

- **Single instance deployment**: Due to in-memory storage, Proxxy cannot be horizontally scaled across multiple instances. Each instance maintains its own connection state independently.

- **One connection per VM**: The server uses the VM ID as the key for storing connections, meaning only one active connection per VM is supported at a time.

- **Bun runtime requirement**: Proxxy requires the Bun runtime and cannot run on standard Node.js. This limits deployment options to environments that support Bun.

- **HTTPS/WSS only**: The implementation assumes Proxmox VE servers use HTTPS/WSS protocols. HTTP/WS connections are not supported.

- **No connection persistence**: There is no database or persistent storage layer. All connection state is ephemeral and lost on restart.

- **No built-in rate limiting**: The server does not implement rate limiting or connection limits, which could lead to resource exhaustion under high load.

## Contributing

I would love contributors! Here's how you can contribute:

- [Open an issue](https://github.com/masterjanic/proxxy/issues) if you believe you've encountered a bug.
- Make a [pull request](https://github.com/masterjanic/proxxy/pull) to add new features/make quality-of-life improvements/fix bugs.

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](./LICENSE) file for details.