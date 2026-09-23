// Shared by the editor preview and PDF/PNG export.
export function measureDocument(doc = document) {
  const sheet = doc.querySelector(".resume-sheet");
  const page = sheet.getBoundingClientRect();
  const boxes = Array.from(doc.querySelectorAll(".resume-header,.resume-section,.entry,li,p,[data-editable],.portrait"))
    .filter((node) => node.getClientRects().length)
    .map((node) => node.getBoundingClientRect());
  const bottom = Math.max(page.top, ...boxes.map((box) => box.bottom));
  const fillRatio = Math.max(0, (bottom - page.top) / page.height);
  const horizontalOverflow = sheet.scrollWidth > sheet.clientWidth + 1 || boxes.some((box) => box.right > page.right + 1 || box.left < page.left - 1);
  const verticalOverflow = fillRatio > 1;
  return { fillRatio, horizontalOverflow, verticalOverflow, clipped: horizontalOverflow || verticalOverflow };
}
