import assert from "node:assert/strict"
import { test } from "node:test"
import { resizeSidebarWidth, sidebarDragResizes, sidebarMaxWidth } from "./sidebar-width.ts"

test("dragging the left edge widens and narrows within the pane limits", () => {
  assert.equal(resizeSidebarWidth(256, 120, "left", sidebarMaxWidth(1440)), 376)
  assert.equal(resizeSidebarWidth(256, -120, "left", sidebarMaxWidth(1440)), 192)
  assert.equal(resizeSidebarWidth(600, 80, "left", sidebarMaxWidth(1440)), 640)
})

test("dragging the right edge moves the opposite way", () => {
  assert.equal(resizeSidebarWidth(256, -80, "right", sidebarMaxWidth(1440)), 336)
})

test("a narrow window keeps room for the main pane", () => {
  assert.equal(sidebarMaxWidth(800), 480)
  assert.equal(sidebarMaxWidth(400), 192)
})

test("a click-sized movement is not a resize", () => {
  assert.equal(sidebarDragResizes(3), false)
  assert.equal(sidebarDragResizes(-3), false)
  assert.equal(sidebarDragResizes(4), true)
})
