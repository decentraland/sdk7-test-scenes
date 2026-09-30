import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// Payloads must be Schemas.Map(...) and stay well under the ~13 KB transport limit
// (oversized messages are dropped silently) — hence MAX_COMMENT_LENGTH.
export const Messages = {
  // Client → server: one Response to one shown Question. rating 0 = no rating.
  // requestId lets the client resend until acked without creating duplicates.
  submitResponse: Schemas.Map({
    requestId: Schemas.String,
    questionId: Schemas.String,
    trigger: Schemas.String,
    rating: Schemas.Int,
    comment: Schemas.String,
    secondsInScene: Schemas.Int,
    platform: Schemas.String
  }),

  // Server → sender: the Response was written to Storage (ok) or the write failed.
  responseSaved: Schemas.Map({ requestId: Schemas.String, ok: Schemas.Boolean })
}

export const room = registerMessages(Messages)
