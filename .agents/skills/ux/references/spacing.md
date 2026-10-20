# Spacing

Padding, margin, and gap use this scale. A larger step is a more important break. Repeated siblings share one gap, and that gap is smaller than the gap before the next group. When a step looks wrong, use the next one.

| px | Tailwind | Use |
| --- | --- | --- |
| 0 | `0` | Flush. A full-bleed row whose parent already insets the column. |
| 4 | `1` | A title and the line under it. |
| 8 | `2` | An icon and its label, or actions in one row. |
| 12 | `3` | Padding inside a control. An icon and the content beside it. |
| 16 | `4` | All four sides of a card, row, dialog, or empty state. Blocks inside a card, and fields. |
| 24 | `6` | A dialog that is the page's focus. A heading and its section. |
| 32 | `8` | Sections in a window. |
| 48 | `12` | Regions on a page. |

A button, input, menu item, or badge may pad its inline and block sides differently. A page may use a larger bottom margin than its side inset. Control height is size, not space.

## Button emphasis and alignment

Choose the variant for the action's importance and context: `default` for primary actions, `outline` for secondary actions, and `ghost` for quiet navigation or utility actions.

Align the visible content of neighboring controls: give their icons the same slot width and their labels the same starting edge. A ghost control keeps its padded hover and focus area, while its icon and label align with adjacent text and controls. Check both the resting and hovered render; matching outer boxes alone does not prove visual alignment.
