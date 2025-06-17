import { ethers } from "ethers"
import { RPC_CONFIG } from "./config.ts"
import { getErrorMessage } from "./utils.ts"

export interface BlockInfo {
  number: number
  hash: string
  timestamp: number
  miner: string
  gasUsed: string
  gasLimit: string
  baseFeePerGas?: string
  transactionCount: number
}

export class BlockchainService {
  private provider: ethers.JsonRpcProvider

  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_CONFIG.AVALANCHE_C_CHAIN)
  }

  /**
   * Get block information by block number or latest block
   * @param blockNumber - The block number to fetch (optional, defaults to latest)
   * @returns Block information
   */
  async getBlock(blockNumber?: number): Promise<BlockInfo> {
    try {
      // Use the block number if provided, otherwise get latest
      const blockTag = blockNumber !== undefined ? blockNumber : "latest"
      const block = await this.provider.getBlock(blockTag)

      if (!block) {
        throw new Error(
          blockNumber !== undefined
            ? `Block ${blockNumber} not found`
            : "Failed to fetch latest block",
        )
      }

      return {
        number: block.number,
        hash: block.hash || "",
        timestamp: block.timestamp,
        miner: block.miner,
        gasUsed: block.gasUsed.toString(),
        gasLimit: block.gasLimit.toString(),
        baseFeePerGas: block.baseFeePerGas?.toString(),
        transactionCount: block.transactions.length,
      }
    } catch (error) {
      throw new Error(`Failed to get block: ${getErrorMessage(error)}`)
    }
  }
}
