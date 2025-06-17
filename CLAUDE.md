# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Repository Overview

This is a simplified MCP (Model Context Protocol) server that demonstrates the
basics of building an MCP server with OAuth2 authentication. It provides a
single tool for querying the latest block on the Avalanche C-Chain blockchain.

## Commands

```bash
# Development
deno task dev              # Run server with --watch flag
deno task start            # Run server in production mode

# Type checking
deno task check            # Type check the codebase

# Formatting and linting
deno task fmt              # Format code
deno task lint             # Lint code

# Docker
deno task docker           # Build Docker image
deno task docker-run       # Build and run container
docker-compose up -d       # Run with docker-compose
```

## Architecture

### Service Structure

The codebase follows a simple modular architecture:

1. **server.ts**: MCP protocol implementation handling JSON-RPC requests, OAuth2
   flows, and tool routing
2. **blockchain.ts**: Blockchain service that queries the latest block from
   Avalanche C-Chain using ethers.js
3. **tools.ts**: Tool definition for the single `get_latest_block` tool
4. **config.ts**: RPC configuration for connecting to Avalanche

### Key Design Patterns

**OAuth2 Flow**:

- Client registration at `/oauth/register`
- Authorization at `/oauth/authorize`
- Token exchange at `/oauth/token`
- In-memory storage for POC (should use persistent storage in production)

**MCP Protocol**:

- JSON-RPC endpoint at `/rpc`
- Supports initialize, tools/list, and tools/call methods
- OAuth2 authentication required for all methods except initialize

### Data Flow

1. MCP client registers and obtains OAuth2 access token
2. Client sends JSON-RPC request to `/rpc` with Bearer token
3. Server validates token and routes to appropriate handler
4. For tool calls, server invokes BlockchainService.getLatestBlock()
5. Block data is returned in MCP response format

## Environment Configuration

Required environment variables:

```
PORT=3000                              # Server port
BASE_URL=http://localhost:3000         # Server base URL for OAuth
RPC_URL=<Avalanche RPC endpoint>       # Avalanche C-Chain RPC
```

## Development Workflow

### Testing the Server

1. Start the server: `deno task dev`
2. Use MCP Inspector or similar tool to test:
   - Register OAuth client
   - Complete OAuth flow
   - Call the `get_latest_block` tool

### Debugging Tips

- Enable Deno inspector: `deno run --inspect server.ts`
- Check OAuth flow by monitoring console logs
- Test individual endpoints with curl or Postman

## Common Patterns

### Error Handling

```typescript
try {
  const result = await blockchainService.getLatestBlock()
  return { content: [{ type: "text", text: JSON.stringify(result) }] }
} catch (error) {
  return {
    content: [{
      type: "text",
      text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
    }],
    isError: true
  }
}
```

## Permissions

The server requires the following Deno permissions:

- `--allow-net`: Required for HTTP server and blockchain RPC calls
- `--allow-read`: Required for reading environment files
- `--allow-env`: Required for reading environment variables

## Security Considerations

- Server is read-only for blockchain operations
- OAuth2 tokens stored in-memory (use persistent storage in production)
- Access tokens expire after 1 hour
- Authorization codes expire after 10 minutes

## Additional Notes

- This is a simplified example for learning MCP server basics
- The single tool queries the latest block from Avalanche C-Chain
- OAuth2 implementation is minimal and for demonstration purposes

## Development Guidelines

- Please run `deno task verify` as your last step before wrapping up a development task

## Coding Principles

- Do not take shortcuts like _-prefixing unused variables, or skipping tests. If there's a need for any of that, please ask before continuing.