import { callRpc, getPlayerAddress, quantityToDecimal, shortenHex, toBigInt } from './rpcUtils'

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

// Common ERC-20 view function selectors (for eth_call / eth_estimateGas)
const ERC20_SELECTORS = [
  '0x06fdde03', // name()
  '0x95d89b41', // symbol()
  '0x313ce567', // decimals()
  '0x18160ddd'  // totalSupply()
]

export const readParamMethods: Web3MethodDef[] = [
  // ---- 1. eth_getBalance ----
  {
    id: 'eth_getBalance',
    name: 'eth_getBalance',
    type: 'read',
    params: [
      { name: 'address', label: 'Address', defaultValue: KNOWN_CONTRACTS[0], randomValues: KNOWN_CONTRACTS }
    ],
    execute: async (params) => {
      const balance = await callRpc('eth_getBalance', [params.address, 'latest'])
      const wei = toBigInt(balance)
      const eth = Number(wei) / 1e18
      return `${eth.toFixed(6)} ETH`
    }
  },

  // ---- 2. eth_call ----
  {
    id: 'eth_call',
    name: 'eth_call',
    type: 'read',
    params: [
      { name: 'to', label: 'To (Contract)', defaultValue: KNOWN_CONTRACTS[0], randomValues: KNOWN_CONTRACTS },
      { name: 'data', label: 'Calldata (hex)', defaultValue: ERC20_SELECTORS[0], randomValues: ERC20_SELECTORS }
    ],
    execute: async (params) => {
      const result = await callRpc('eth_call', [{ to: params.to, data: params.data }, 'latest'])
      if (!result || result === '0x') return '(empty)'
      if (result.length > 50) return `${result.slice(0, 42)}… (${(result.length - 2) / 2} bytes)`
      return result
    }
  },

  // ---- 3. eth_getStorageAt ----
  {
    id: 'eth_getStorageAt',
    name: 'eth_getStorageAt',
    type: 'read',
    params: [
      { name: 'address', label: 'Contract Address', defaultValue: KNOWN_CONTRACTS[0], randomValues: KNOWN_CONTRACTS },
      { name: 'slot', label: 'Storage Slot', defaultValue: '0x0' }
    ],
    execute: async (params) => {
      const value = await callRpc('eth_getStorageAt', [params.address, params.slot, 'latest'])
      if (value === '0x' + '0'.repeat(64)) return '0x0 (empty slot)'
      return value
    }
  },

  // ---- 4. eth_getBlockByNumber ----
  {
    id: 'eth_getBlockByNumber',
    name: 'eth_getBlockByNumber',
    type: 'read',
    params: [
      { name: 'block', label: 'Block (hex or tag)', defaultValue: 'latest', randomValues: ['latest', 'earliest', '0xF42400', '0x1312D00'] }
    ],
    execute: async (params) => {
      const block = await callRpc('eth_getBlockByNumber', [params.block, false])
      if (!block) return 'Block not found'
      const num = quantityToDecimal(block.number)
      const txCount = block.transactions?.length ?? 0
      const hash = shortenHex(block.hash, 18)
      return `#${num} | ${txCount} txs | ${hash}`
    }
  },

  // ---- 5. eth_getTransactionCount ----
  {
    id: 'eth_getTransactionCount',
    name: 'eth_getTransactionCount',
    type: 'read',
    params: [
      { name: 'address', label: 'Address', defaultValue: KNOWN_CONTRACTS[0], randomValues: KNOWN_CONTRACTS }
    ],
    execute: async (params) => {
      const count = await callRpc('eth_getTransactionCount', [params.address, 'latest'])
      return `Nonce: ${quantityToDecimal(count)}`
    }
  },

  // ---- 6. eth_getTransactionReceipt ----
  {
    id: 'eth_getTransactionReceipt',
    name: 'eth_getTransactionReceipt',
    type: 'read',
    params: [
      { name: 'txHash', label: 'Transaction Hash', defaultValue: '0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060' }
    ],
    execute: async (params) => {
      const receipt = await callRpc('eth_getTransactionReceipt', [params.txHash])
      if (!receipt) return 'Receipt not found'
      const status = receipt.status === '0x1' ? 'Success' : receipt.status === '0x0' ? 'Failed' : 'Pre-Byzantium'
      const gas = quantityToDecimal(receipt.gasUsed)
      const blk = quantityToDecimal(receipt.blockNumber)
      return `${status} | Gas: ${gas} | Block #${blk}`
    }
  },

  // ---- 7. eth_estimateGas ----
  {
    id: 'eth_estimateGas',
    name: 'eth_estimateGas',
    type: 'read',
    params: [
      { name: 'from', label: 'From', defaultValue: () => getPlayerAddress() },
      { name: 'to', label: 'To (Contract)', defaultValue: KNOWN_CONTRACTS[0], randomValues: KNOWN_CONTRACTS },
      { name: 'data', label: 'Calldata (hex)', defaultValue: ERC20_SELECTORS[0], randomValues: ERC20_SELECTORS }
    ],
    execute: async (params) => {
      const txObj: Record<string, string> = { to: params.to, data: params.data }
      if (params.from) txObj.from = params.from
      const gas = await callRpc('eth_estimateGas', [txObj])
      return `Gas: ${quantityToDecimal(gas)}`
    }
  },

  // ---- 8. eth_getCode ----
  {
    id: 'eth_getCode',
    name: 'eth_getCode',
    type: 'read',
    params: [
      { name: 'address', label: 'Contract Address', defaultValue: KNOWN_CONTRACTS[0], randomValues: KNOWN_CONTRACTS }
    ],
    execute: async (params) => {
      const code = await callRpc('eth_getCode', [params.address, 'latest'])
      if (!code || code === '0x') return 'No code (EOA or empty)'
      const bytes = (code.length - 2) / 2
      return `${code.slice(0, 20)}…${code.slice(-8)} (${bytes} bytes)`
    }
  },

  // ---- 9. web3_sha3 ----
  {
    id: 'web3_sha3',
    name: 'web3_sha3',
    type: 'read',
    params: [
      {
        name: 'data',
        label: 'Hex Data',
        defaultValue: '0x68656c6c6f',
        randomValues: ['0x68656c6c6f', '0x776f726c64', '0xdeadbeef', '0x48656c6c6f20576f726c64']
      }
    ],
    execute: async (params) => {
      const hash = await callRpc('web3_sha3', [params.data])
      return String(hash)
    }
  }
]

// --- Write methods ---

const TEST_RECIPIENT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const SAMPLE_PERSONAL_MESSAGE = '0x48656c6c6f2c20446563656e7472616c616e6421' // "Hello, Decentraland!"

const SAMPLE_TYPED_DATA = JSON.stringify({
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' }
    ],
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' }
    ],
    Mail: [
      { name: 'from', type: 'Person' },
      { name: 'to', type: 'Person' },
      { name: 'contents', type: 'string' }
    ]
  },
  primaryType: 'Mail',
  domain: {
    name: 'Ether Mail',
    version: '1',
    chainId: 11155111,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
  },
  message: {
    from: { name: 'Alice', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
    to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
    contents: 'Hello, Bob!'
  }
})

export const writeMethods: Web3MethodDef[] = [
  // ---- 1. eth_requestAccounts ----
  {
    id: 'eth_requestAccounts',
    name: 'eth_requestAccounts',
    type: 'write',
    execute: async () => {
      const result = await callRpc('eth_requestAccounts')
      const accounts = Array.isArray(result) ? result : [result]
      return `Accounts: ${accounts.map((a: string) => shortenHex(a, 14)).join(', ')}`
    }
  },

  // ---- 2. personal_sign ----
  {
    id: 'personal_sign',
    name: 'personal_sign',
    type: 'write',
    params: [
      {
        name: 'message',
        label: 'Message (hex)',
        defaultValue: SAMPLE_PERSONAL_MESSAGE,
        randomValues: [
          SAMPLE_PERSONAL_MESSAGE,
          '0x5369676e2074686973206d657373616765', // "Sign this message"
          '0xdeadbeef'
        ]
      },
      { name: 'address', label: 'Signer Address', defaultValue: () => getPlayerAddress() }
    ],
    execute: async (params) => {
      const result = await callRpc('personal_sign', [params.message, params.address])
      const sig = typeof result === 'string' ? result
        : (result as any)?.result ?? JSON.stringify(result)
      return `Sig: ${shortenHex(sig, 24)}`
    }
  },

  // ---- 3. eth_signTypedData_v4 ----
  {
    id: 'eth_signTypedData_v4',
    name: 'eth_signTypedData_v4',
    type: 'write',
    params: [
      { name: 'address', label: 'Signer Address', defaultValue: () => getPlayerAddress() },
      { name: 'typedData', label: 'Typed Data (JSON)', defaultValue: SAMPLE_TYPED_DATA }
    ],
    execute: async (params) => {
      let data: any
      try {
        data = JSON.parse(params.typedData)
      } catch {
        throw new Error('Invalid JSON in typedData field')
      }
      const result = await callRpc('eth_signTypedData_v4', [params.address, data])
      const sig = typeof result === 'string' ? result
        : (result as any)?.result ?? JSON.stringify(result)
      return `Sig: ${shortenHex(sig, 24)}`
    }
  },

  // ---- 4. eth_sendTransaction ----
  {
    id: 'eth_sendTransaction',
    name: 'eth_sendTransaction',
    type: 'write',
    params: [
      { name: 'from', label: 'From', defaultValue: () => getPlayerAddress() },
      { name: 'to', label: 'To', defaultValue: TEST_RECIPIENT, randomValues: KNOWN_CONTRACTS },
      { name: 'value', label: 'Value (hex wei)', defaultValue: '0x0' },
      { name: 'data', label: 'Data (hex)', defaultValue: '0x' }
    ],
    execute: async (params) => {
      const txObj: Record<string, string> = {
        from: params.from,
        to: params.to,
        data: params.data
      }
      if (params.value && params.value !== '0x0') {
        txObj.value = params.value
      }
      const txHash = await callRpc('eth_sendTransaction', [txObj])
      return `TX: ${shortenHex(txHash, 20)}`
    }
  }
]
