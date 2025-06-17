// RPC Configuration
export const RPC_CONFIG = {
  AVALANCHE_C_CHAIN: Deno.env.get("RPC_URL") ||
    "https://api.avax.network/ext/bc/C/rpc",
  CHAIN_ID: parseInt(Deno.env.get("CHAIN_ID") || "43114"),
}
