# SDK7 Item Purchase

Tests buying a wearable or an emote with credits from inside a scene.

A machine calls `openExplorerUiAndWait({ ui: ExplorerUi.EU_ITEM_PURCHASE, itemPurchase: { urn } })`. The explorer
opens its purchase modal for that item, and the scene learns how it ended (`purchased`, `dismissed` or `failed`)
through the `ItemPurchase` channel. The scene supplies only the urn; price and payment are the explorer's.

## Machines

- **Wearable** sells `WEARABLE_URN`.
- **Emote** sells `EMOTE_URN`. It is disabled until you set that value in `src/config.ts`.
- **Broken item** offers a urn that is not an item, to see the `failed` outcome without a modal.

A green sphere appears next to a machine for every completed purchase.

## Setup

1. Set `ENVIRONMENT` and the urns in `src/config.ts`. The items need a primary listing that can be paid with credits.
2. `npm run start -- --no-client` in this folder.
3. In the explorer, connect to the local scene with the matching environment (`zone` for the default config) and
   with buying with credits enabled for your account. Without it every click answers `REJECTED_FEATURE_DISABLED`.

A completed purchase is real: it spends credits and mints the item.
