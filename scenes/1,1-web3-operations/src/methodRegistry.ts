import { callRpc, quantityToDecimal, toBigInt } from './rpcUtils'

export interface MethodParam {
  name: string
  label: string
  defaultValue: string | (() => string)
}

export interface Web3MethodDef {
  id: string
  name: string
  type: 'read' | 'write'
  params?: MethodParam[]
  execute: (params: Record<string, string>) => Promise<string>
}

// --- Non-parameterized read-only methods ---

export const readSimpleMethods: Web3MethodDef[] = [
  {
    id: 'eth_blockNumber',
    name: 'eth_blockNumber',
    type: 'read',
    execute: async () => {
      const result = await callRpc('eth_blockNumber')
      return `Block: ${quantityToDecimal(result)}`
    }
  },
  {
    id: 'eth_gasPrice',
    name: 'eth_gasPrice',
    type: 'read',
    execute: async () => {
      const result = await callRpc('eth_gasPrice')
      const wei = toBigInt(result)
      const gwei = Number(wei) / 1e9
      return `${gwei.toFixed(2)} Gwei`
    }
  },
  {
    id: 'eth_chainId',
    name: 'eth_chainId',
    type: 'read',
    execute: async () => {
      const result = await callRpc('eth_chainId')
      return `Chain: ${quantityToDecimal(result)}`
    }
  },
  {
    id: 'net_version',
    name: 'net_version',
    type: 'read',
    execute: async () => {
      const result = await callRpc('net_version')
      return `Network: ${result}`
    }
  },
  {
    id: 'eth_protocolVersion',
    name: 'eth_protocolVersion',
    type: 'read',
    execute: async () => {
      const result = await callRpc('eth_protocolVersion')
      return `Protocol: ${result}`
    }
  },
  {
    id: 'web3_clientVersion',
    name: 'web3_clientVersion',
    type: 'read',
    execute: async () => {
      const result = await callRpc('web3_clientVersion')
      const display = typeof result === 'string' && result.length > 30
        ? result.slice(0, 30) + '...'
        : String(result)
      return display
    }
  }
]
