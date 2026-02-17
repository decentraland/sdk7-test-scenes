import { callRpc, quantityToDecimal, shortenHex, toBigInt } from './rpcUtils'

export interface MethodParam {
  name: string
  label: string
  defaultValue: string | (() => string)
  /** If set, UI shows a "Random" button that picks from this list. */
  randomValues?: string[]
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
      return String(result)
    }
  }
]

// --- Parameterized read-only methods ---

// Well-known contracts on Ethereum mainnet (all guaranteed to have code)
const KNOWN_CONTRACTS = [
  '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942', // MANA
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap V2 Router
  '0xdAC17F958D2ee523a2206206994597C13D831ec7'  // USDT
]

export const readParamMethods: Web3MethodDef[] = [
  {
    id: 'eth_getCode',
    name: 'eth_getCode',
    type: 'read',
    params: [
      {
        name: 'address',
        label: 'Contract Address',
        defaultValue: KNOWN_CONTRACTS[0],
        randomValues: KNOWN_CONTRACTS
      }
    ],
    execute: async (params) => {
      const code = await callRpc('eth_getCode', [params.address, 'latest'])
      if (!code || code === '0x') return 'No code (EOA or empty)'
      const bytes = (code.length - 2) / 2
      return `${code.slice(0, 20)}…${code.slice(-8)} (${bytes} bytes)`
    }
  }
]
