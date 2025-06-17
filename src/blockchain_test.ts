import { assertEquals, assertExists } from "@std/assert"
import { BlockchainService } from "./blockchain.ts"

Deno.test("BlockchainService - getBlock returns latest block", async () => {
  const service = new BlockchainService()
  const block = await service.getBlock()

  assertExists(block.number)
  assertExists(block.hash)
  assertExists(block.timestamp)
  assertExists(block.miner)
  assertExists(block.gasUsed)
  assertExists(block.gasLimit)
  assertExists(block.transactionCount)

  // Latest block should have a positive block number
  assertEquals(typeof block.number, "number")
  assertEquals(block.number > 0, true)
})

Deno.test("BlockchainService - getBlock with specific block number", async () => {
  const service = new BlockchainService()
  // Use block 1 as it should always exist
  const block = await service.getBlock(1)

  assertEquals(block.number, 1)
  assertExists(block.hash)
  assertExists(block.timestamp)
})
