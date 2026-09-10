// `TeleportToRequest.realm` comes from decentraland/protocol#477 and is not in a published `@dcl/sdk`
// yet, so it is merged into the ambient `~system/RestrictedActions` declaration here to keep this
// scene type-checked. Delete this file once the scene's `@dcl/sdk` declares the field itself.
declare module '~system/RestrictedActions' {
  export interface TeleportToRequest {
    realm?: string | undefined
  }
}
