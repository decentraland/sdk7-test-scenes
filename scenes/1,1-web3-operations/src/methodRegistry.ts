import { callRpc, quantityToDecimal } from './rpcUtils'

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

export const methods: Web3MethodDef[] = [
  {
    id: 'eth_blockNumber',
    name: 'eth_blockNumber',
    type: 'read',
    execute: async () => {
      const result = await callRpc('eth_blockNumber')
      return `Block: ${quantityToDecimal(result)}`
    }
  }
]
