# Relay pages use the Academy City design language

The relay's pages take their look from the official site and printed material for *A Certain Scientific Railgun T*: white paper next to a red-to-orange band, square corners, and rules drawn as rows of small squares. The name Mukae (迎え) is Japanese, and this look gives the pages a recognizable identity where the earlier neutral gray theme had none.

## What it consists of

- **Color.** A band gradient from red `#e2231a` to orange `#f08a2b`. Solid `#c93a12` for primary buttons, so white text on them reaches 5.1:1. Electric cyan `#35b5e5` marks what is live: online devices, live connections, and the focus ring. Amber marks warnings. Off-white `#faf8f6` paper.
- **Type.** Noto Sans for body text and Maple Mono for code. Oswald is reserved for the band titles, the wordmark, and account page titles. The reference site's serif is not used.
- **Shape.** Every corner is square (`--radius: 0`). Only `rounded-full` stays round: avatars and the round icon badges taken from the festival programme page. Status lights are small squares, like the rows of squares.
- **Motifs.** A dashboard section is white paper under a gradient band that holds its title and main action. Both the dashboard and the account pages open with a thin gradient line, and graph paper fades out behind the first screen. List rows are separated by a line of small squares. An account page centers one sheet: the mark or icon, the title, a gradient row of squares, then the action.

## Rules that keep it readable

- White text on the band sits only at the red end, where it stays above 3:1 at its 24px size. Anything at the orange end, such as the Add device button, is a white button with primary text.
- Copy stays English. Japanese appears only in the mark.
- The band stays narrow: a section header or a line, never a panel. A large field of red with big white characters reads as a Spring Festival couplet, which an earlier draft of the account pages did.
- The band carries a section's title, never its status or data, so the `ux` hierarchy rules apply unchanged inside the paper.

## Considered Options

- **Keep the neutral theme.** Readable, but gave no sense of the product and looked like any starter kit.
- **Copy the reference closely, including character art and the mint gradient buttons.** Art is not ours to use, and a second loud gradient on buttons competed with the band for the primary action.
