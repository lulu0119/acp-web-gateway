const SIDEBAR_MIN_WIDTH = 192
const SIDEBAR_MAX_WIDTH = 640
const MAIN_PANE_MIN_WIDTH = 320
const DRAG_THRESHOLD = 4

export function sidebarMaxWidth(viewportWidth: number) {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, viewportWidth - MAIN_PANE_MIN_WIDTH))
}

export function clampSidebarWidth(width: number, maxWidth: number) {
  return Math.round(Math.min(maxWidth, Math.max(SIDEBAR_MIN_WIDTH, width)))
}

export function resizeSidebarWidth(startWidth: number, deltaX: number, side: "left" | "right", maxWidth: number) {
  const delta = side === "left" ? deltaX : -deltaX
  return clampSidebarWidth(startWidth + delta, maxWidth)
}

export function sidebarDragResizes(deltaX: number) {
  return Math.abs(deltaX) >= DRAG_THRESHOLD
}
