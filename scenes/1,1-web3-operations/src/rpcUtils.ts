import { getPlayer } from '@dcl/sdk/src/players'
import { sendAsync } from '~system/EthereumController'

/**
 * Low-level RPC call via EthereumController.sendAsync.
 * Bypasses createEthereumProvider (which has a build bug in SDK 7.20.0).
 * Returns the parsed `result` field from the JSON-RPC response.
 */
export async function callRpc(method: string, params: unknown[] = []): Promise<any> {
  const response = await sendAsync({
    id: 1,
    method,
    jsonParams: JSON.stringify(params)
  })

  const raw = response.jsonAnyResponse
  try {
    const parsed = JSON.parse(raw)
    if (parsed.error) {
      throw new Error(parsed.error.message || JSON.stringify(parsed.error))
    }
    return parsed.result !== undefined ? parsed.result : parsed
  } catch (e: any) {
    if (e.message && !e.message.startsWith('Unexpected')) throw e
    return raw
  }
}

export function getPlayerAddress(): string {
  const player = getPlayer()
  if (!player?.userId) {
    throw new Error('Web3 wallet not connected')
  }
  return player.userId
}

export function quantityToDecimal(value: string | number | bigint): string {
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') {
    if (value.startsWith('0x')) {
      return value === '0x' ? '0' : BigInt(value).toString()
    }
    return value
  }
  return String(value)
}

export function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(value)
  if (value === '0x' || value === '') return BigInt(0)
  return BigInt(value)
}

export function shortenHex(value: string | undefined | null, maxLen = 10): string {
  if (!value) return '\u2014'
  if (value.length <= maxLen) return value
  return `${value.slice(0, maxLen)}\u2026`
}
