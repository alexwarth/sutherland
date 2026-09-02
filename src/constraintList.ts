import scope from './scope';
import { ctx } from './canvas';
import { Constraint } from './constraints';
import { Drawing } from './Drawing';

let visible = false;

// the list lives at fixed screen coordinates, so we track the raw pointer
// position instead of going through the pen (whose position gets snapped)
const pointerScreenPos = { x: -Infinity, y: -Infinity };
window.addEventListener('pointermove', (e) => {
  pointerScreenPos.x = e.clientX;
  pointerScreenPos.y = e.clientY;
});

export function toggle() {
  visible = !visible;
  return visible;
}

const fontSizeInPixels = 16;
const font = `${fontSizeInPixels}px Monaco`;
const lineHeight = fontSizeInPixels * 1.5;
const leftMargin = 20;
const topMargin = 20;
const hitPadding = 6;

function isPointerOverRow(idx: number, text: string) {
  const rowTop = topMargin + idx * lineHeight;
  return (
    pointerScreenPos.x >= leftMargin - hitPadding &&
    pointerScreenPos.x <= leftMargin + ctx.measureText(text).width + hitPadding &&
    pointerScreenPos.y >= rowTop &&
    pointerScreenPos.y < rowTop + lineHeight
  );
}

export function constraintUnderPointer(drawing: Drawing): Constraint | null {
  if (!visible) {
    return null;
  }

  ctx.font = font;
  let ans: Constraint | null = null;
  let idx = 0;
  drawing.constraints.forEach((constraint) => {
    if (isPointerOverRow(idx, constraint.displayName)) {
      ans = constraint;
    }
    idx++;
  });
  return ans;
}

export function render(drawing: Drawing) {
  if (!visible) {
    return;
  }

  ctx.font = font;

  let hoveredConstraint: Constraint | null = null;
  let idx = 0;
  drawing.constraints.forEach((constraint) => {
    const isHovered = isPointerOverRow(idx, constraint.displayName);
    if (isHovered) {
      hoveredConstraint = constraint;
    }
    ctx.fillStyle = isHovered ? 'rgba(255,222,33,0.9)' : 'rgba(255,255,255,0.5)';
    ctx.fillText(constraint.displayName, leftMargin, topMargin + idx * lineHeight + fontSizeInPixels);
    idx++;
  });

  if (idx === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('(no constraints)', leftMargin, topMargin + fontSizeInPixels);
  }

  hoveredConstraint?.renderHighlight(scope.toScreenPosition, 'rgba(255,222,33,0.9)');
}
