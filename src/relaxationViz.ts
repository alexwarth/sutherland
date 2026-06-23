import scope from './scope';
import { ctx, drawLine, flickeryWhiteEquivalentGray, withGlobalAlpha } from './canvas';
import ConstraintSet from './ConstraintSet';
import { Drawing } from './Drawing';
import { Position } from './helpers';
import { Handle } from './things';
import { Var } from './state';

const ARROW_YELLOW = 'rgba(255, 220, 50, 0.85)';
const ARROW_BLUE = 'rgba(80, 160, 255, 0.95)';
const PANEL_BG_OPAQUE = 'rgba(0, 0, 0, 0.55)';
const PLOT_CURVE = 'rgba(255, 200, 60, 0.95)';
const PLOT_AXIS = 'rgba(180, 180, 180, 0.75)';
const PLOT_MARKER = 'rgba(255, 255, 255, 0.9)';

const ARROW_LENGTH = 22;
const AXIS_LABEL_PAD = 18;
const AXIS_LABEL_FONT = '11px system-ui, sans-serif';
const ONION_SKIN_FRAMES = 6;
const MAX_RELAX_STEPS = 5000;
const GHOST_PLOT_SAMPLES = 100;

let enabled = false;
let onionSkinEnabled = false;
let futureStates: Map<Var<unknown>, unknown>[] = [];

export function isEnabled() {
  return enabled;
}

export function setMode(onionSkin: boolean) {
  if (enabled && onionSkinEnabled === onionSkin) {
    enabled = false;
  } else {
    enabled = true;
    onionSkinEnabled = onionSkin;
  }
  return enabled;
}

function statusLabel() {
  if (!enabled) {
    return 'relaxation viz off';
  }
  return onionSkinEnabled ? 'relaxation viz on (future)' : 'relaxation viz on';
}

export function toggleStatusLabel() {
  return statusLabel();
}

export function prepare(drawing: Drawing) {
  if (!enabled || !onionSkinEnabled || drawing.isEmpty()) {
    futureStates = [];
    return;
  }
  const saved = snapshotVars(drawing);
  futureStates = [];
  try {
    const trajectory: Map<Var<unknown>, unknown>[] = [];
    let steps = 0;
    while (steps < MAX_RELAX_STEPS && drawing.relax()) {
      steps++;
      trajectory.push(snapshotVars(drawing));
    }
    if (trajectory.length === 0) {
      return;
    }
    const frameCount = Math.min(ONION_SKIN_FRAMES, trajectory.length);
    for (let i = 1; i <= frameCount; i++) {
      const idx = Math.min(
        trajectory.length - 1,
        Math.round((i / frameCount) * trajectory.length) - 1,
      );
      futureStates.push(trajectory[idx]);
    }
  } finally {
    restoreVars(saved);
  }
}

export function renderOnionSkin(drawing: Drawing) {
  if (!enabled || !onionSkinEnabled || drawing.isEmpty() || futureStates.length === 0) {
    return;
  }

  const saved = snapshotVars(drawing);
  try {
    for (let i = futureStates.length - 1; i >= 0; i--) {
      restoreVars(futureStates[i]);
      withGlobalAlpha(ghostAlpha(i, futureStates.length), () =>
        drawing.render(scope.toScreenPosition, flickeryWhiteEquivalentGray()),
      );
    }
  } finally {
    restoreVars(saved);
  }
}

export function render(drawing: Drawing, penPos: Position | null) {
  if (!enabled || drawing.isEmpty()) {
    return;
  }

  const hovered = penPos ? drawing.handleAt(penPos) : null;
  const saved = snapshotVars(drawing);

  try {
    restoreVars(saved);
    renderArrows(drawing, hovered, true);
    if (hovered) {
      const [xVar, yVar] = handleVars(hovered);
      renderHoverPlots(drawing, hovered, xVar, yVar, saved);
    }
  } finally {
    restoreVars(saved);
  }
}

function snapshotVars(drawing: Drawing) {
  const snap = new Map<Var<unknown>, unknown>();
  drawing.forEachVar((v) => snap.set(v, v.value));
  return snap;
}

function restoreVars(snap: Map<Var<unknown>, unknown>) {
  for (const [v, value] of snap) {
    v.value = value;
  }
}

function ghostAlpha(i: number, total: number) {
  const t = i / Math.max(total - 1, 1);
  return 0.25 + 0.45 * (1 - t);
}

function renderArrows(drawing: Drawing, hovered: Handle | null, highlightHovered: boolean) {
  const deltas = collectDeltas(drawing);
  forEachHandle(drawing, (handle) => {
    const [xVar, yVar] = handleVars(handle);
    const color =
      highlightHovered && handle === hovered ? ARROW_BLUE : ARROW_YELLOW;
    drawAxisArrow(handle, deltas.get(xVar) ?? 0, 0, color);
    drawAxisArrow(handle, deltas.get(yVar) ?? 0, 1, color);
  });
}

function collectDeltas(drawing: Drawing) {
  const vars: Var<number>[] = [];
  forEachHandle(drawing, (handle) => {
    handle.forEachRelaxableVar((v) => vars.push(v));
  });
  return drawing.constraints.probeRelaxationDeltas(vars);
}

function forEachHandle(drawing: Drawing, fn: (handle: Handle) => void) {
  for (const thing of drawing.things) {
    thing.forEachHandle(fn);
  }
  drawing.attachers.forEach(fn);
}

function handleVars(handle: Handle): [Var<number>, Var<number>] {
  const vars: Var<number>[] = [];
  handle.forEachRelaxableVar((v) => vars.push(v));
  return [vars[0], vars[1]];
}

function drawAxisArrow(handle: Handle, delta: number, axis: 0 | 1, color: string) {
  if (delta === 0) {
    return;
  }

  const start = scope.toScreenPosition(handle);
  const sign = delta > 0 ? 1 : -1;
  const end =
    axis === 0
      ? { x: start.x + sign * ARROW_LENGTH, y: start.y }
      : { x: start.x, y: start.y - sign * ARROW_LENGTH };

  drawArrow(start, end, color);
}

function drawArrow(start: Position, end: Position, color: string) {
  drawLine(start, end, color);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    return;
  }

  const ux = dx / len;
  const uy = dy / len;
  const headLen = 8;
  const perpX = -uy;
  const perpY = ux;
  const tip = end;
  const base = { x: tip.x - ux * headLen, y: tip.y - uy * headLen };
  drawLine(tip, { x: base.x + perpX * headLen * 0.4, y: base.y + perpY * headLen * 0.4 }, color);
  drawLine(tip, { x: base.x - perpX * headLen * 0.4, y: base.y - perpY * headLen * 0.4 }, color);
}

function renderHoverPlots(
  drawing: Drawing,
  handle: Handle,
  xVar: Var<number>,
  yVar: Var<number>,
  currentState: Map<Var<unknown>, unknown>,
) {
  const constraints = drawing.constraints;
  const layout = plotLayout();
  const xRange = screenXRange();
  const yRange = screenYRange();
  const xErrorBounds = sharedErrorBounds(
    constraints,
    xVar,
    xRange.min,
    xRange.max,
    onionSkinEnabled ? futureStates : [],
    currentState,
  );
  const yErrorBounds = sharedErrorBounds(
    constraints,
    yVar,
    yRange.min,
    yRange.max,
    onionSkinEnabled ? futureStates : [],
    currentState,
  );

  if (onionSkinEnabled) {
    for (let i = futureStates.length - 1; i >= 0; i--) {
      restoreVars(futureStates[i]);
      const deltas = collectDeltas(drawing);
      withGlobalAlpha(ghostAlpha(i, futureStates.length), () => {
        drawHoverPlotLayer({
          layout,
          constraints,
          handle,
          xVar,
          yVar,
          deltas,
          xRange,
          yRange,
          xErrorBounds,
          yErrorBounds,
          ghost: true,
        });
      });
    }
  }

  restoreVars(currentState);
  const deltas = collectDeltas(drawing);

  drawPanelBackground(layout);

  drawHoverPlotLayer({
    layout,
    constraints,
    handle,
    xVar,
    yVar,
    deltas,
    xRange,
    yRange,
    xErrorBounds,
    yErrorBounds,
    ghost: false,
  });
}

function drawPanelBackground(layout: ReturnType<typeof plotLayout>) {
  const grad = ctx.createLinearGradient(layout.panelLeft, 0, innerWidth, 0);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, PANEL_BG_OPAQUE);
  ctx.fillStyle = grad;
  ctx.fillRect(layout.panelLeft, 0, layout.panelWidth, layout.panelHeight);
}

function drawHoverPlotLayer({
  layout,
  constraints,
  handle,
  xVar,
  yVar,
  deltas,
  xRange,
  yRange,
  xErrorBounds,
  yErrorBounds,
  ghost,
}: {
  layout: ReturnType<typeof plotLayout>;
  constraints: ConstraintSet;
  handle: Handle;
  xVar: Var<number>;
  yVar: Var<number>;
  deltas: Map<Var<number>, number>;
  xRange: { min: number; max: number; sampleCount: number };
  yRange: { min: number; max: number; sampleCount: number };
  xErrorBounds: { minError: number; maxError: number };
  yErrorBounds: { minError: number; maxError: number };
  ghost: boolean;
}) {
  const plotSamples = ghost ? GHOST_PLOT_SAMPLES : undefined;

  drawValueVsErrorPlot({
    left: layout.left,
    top: layout.xPlotTop,
    width: layout.width,
    height: layout.height,
    valueLabel: 'x',
    errorLabel: 'Σe²',
    var: xVar,
    currentValue: handle.x,
    delta: deltas.get(xVar) ?? 0,
    constraints,
    minValue: xRange.min,
    maxValue: xRange.max,
    sampleCount: plotSamples ?? xRange.sampleCount,
    errorBounds: xErrorBounds,
    arrowAxis: 0,
    ghost,
  });

  drawErrorVsValuePlot({
    left: layout.left,
    top: layout.yPlotTop,
    width: layout.width,
    height: layout.height,
    valueLabel: 'y',
    errorLabel: 'Σe²',
    var: yVar,
    currentValue: handle.y,
    delta: deltas.get(yVar) ?? 0,
    constraints,
    minValue: yRange.min,
    maxValue: yRange.max,
    sampleCount: plotSamples ?? yRange.sampleCount,
    errorBounds: yErrorBounds,
    ghost,
  });
}

function sharedErrorBounds(
  constraints: ConstraintSet,
  v: Var<number>,
  minValue: number,
  maxValue: number,
  states: Map<Var<unknown>, unknown>[],
  currentState: Map<Var<unknown>, unknown>,
) {
  let maxError = 0;
  for (const state of [...states, currentState]) {
    restoreVars(state);
    const samples = sampleSquaredError(constraints, v, minValue, maxValue, GHOST_PLOT_SAMPLES);
    maxError = Math.max(maxError, constraints.totalSquaredError());
    for (const { error } of samples) {
      maxError = Math.max(maxError, error);
    }
  }
  if (maxError <= 0) {
    maxError = 1;
  }
  return { minError: 0, maxError };
}

function plotLayout() {
  const size = Math.min(innerWidth, innerHeight);
  const panelWidth = size / 3;
  const panelLeft = innerWidth - panelWidth;
  const margin = 12;
  const xLabelSpace = 16;
  const plotGap = 28;
  const plotOuterWidth = panelWidth - margin * 2;
  const plotChartSize = plotOuterWidth - AXIS_LABEL_PAD;
  const panelHeight = margin * 2 + plotChartSize * 2 + xLabelSpace + plotGap;

  return {
    panelLeft,
    panelWidth,
    panelHeight,
    left: panelLeft + margin,
    top: margin,
    xPlotTop: margin,
    yPlotTop: margin + plotChartSize + xLabelSpace + plotGap,
    width: plotOuterWidth,
    height: plotChartSize,
  };
}

function screenXRange() {
  return {
    min: scope.fromScreenPosition({ x: 0, y: 0 }).x,
    max: scope.fromScreenPosition({ x: innerWidth, y: 0 }).x,
    sampleCount: innerWidth,
  };
}

function screenYRange() {
  return {
    min: scope.fromScreenPosition({ x: 0, y: innerHeight }).y,
    max: scope.fromScreenPosition({ x: 0, y: 0 }).y,
    sampleCount: innerHeight,
  };
}

function sampleSquaredError(
  constraints: ConstraintSet,
  v: Var<number>,
  minValue: number,
  maxValue: number,
  count: number,
) {
  constraints.forEach((c) => c.preRelax());
  const origValue = v.value;
  const samples: { value: number; error: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    v.value = minValue + t * (maxValue - minValue);
    samples.push({ value: v.value, error: constraints.totalSquaredError() });
  }
  v.value = origValue;
  return samples;
}

function drawValueVsErrorPlot({
  left,
  top,
  width,
  height,
  valueLabel,
  errorLabel,
  var: v,
  currentValue,
  delta,
  constraints,
  minValue,
  maxValue,
  sampleCount,
  errorBounds: bounds,
  arrowAxis,
  ghost,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  valueLabel: string;
  errorLabel: string;
  var: Var<number>;
  currentValue: number;
  delta: number;
  constraints: ConstraintSet;
  minValue: number;
  maxValue: number;
  sampleCount: number;
  errorBounds: { minError: number; maxError: number };
  arrowAxis: 0 | 1;
  ghost: boolean;
}) {
  const samples = sampleSquaredError(constraints, v, minValue, maxValue, sampleCount);
  const currentError = constraints.totalSquaredError();
  const { minError, maxError } = bounds;

  const plotTop = top;
  const plotHeight = height;
  const plotLeft = left + AXIS_LABEL_PAD;
  const plotWidth = width - AXIS_LABEL_PAD;

  if (!ghost) {
    drawPlotAxes({
      plotLeft,
      plotTop,
      plotWidth,
      plotHeight,
      horizontalLabel: valueLabel,
      verticalLabel: errorLabel,
      xAxis: 'bottom',
      verticalLabelAt: 'top',
    });
  }

  const toX = (value: number) =>
    plotLeft + ((value - minValue) / (maxValue - minValue)) * plotWidth;
  const toY = (error: number) =>
    plotTop + plotHeight - ((error - minError) / (maxError - minError)) * plotHeight;

  drawCurve(samples, (sample) => ({ x: toX(sample.value), y: toY(sample.error) }));

  const marker = { x: toX(currentValue), y: toY(currentError) };
  drawMarker(marker);
  if (!ghost) {
    drawPlotArrow(marker, delta, arrowAxis, ARROW_BLUE);
  }
}

function drawErrorVsValuePlot({
  left,
  top,
  width,
  height,
  valueLabel,
  errorLabel,
  var: v,
  currentValue,
  delta,
  constraints,
  minValue,
  maxValue,
  sampleCount,
  errorBounds: bounds,
  ghost,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  valueLabel: string;
  errorLabel: string;
  var: Var<number>;
  currentValue: number;
  delta: number;
  constraints: ConstraintSet;
  minValue: number;
  maxValue: number;
  sampleCount: number;
  errorBounds: { minError: number; maxError: number };
  ghost: boolean;
}) {
  const samples = sampleSquaredError(constraints, v, minValue, maxValue, sampleCount);
  const currentError = constraints.totalSquaredError();
  const { minError, maxError } = bounds;

  const plotTop = top;
  const plotHeight = height;
  const plotLeft = left + AXIS_LABEL_PAD;
  const plotWidth = width - AXIS_LABEL_PAD;

  if (!ghost) {
    drawPlotAxes({
      plotLeft,
      plotTop,
      plotWidth,
      plotHeight,
      horizontalLabel: errorLabel,
      verticalLabel: valueLabel,
      xAxis: 'top',
      verticalLabelAt: 'bottom',
    });
  }

  const toX = (error: number) =>
    plotLeft + ((error - minError) / (maxError - minError)) * plotWidth;
  const toY = (value: number) =>
    plotTop + plotHeight - ((value - minValue) / (maxValue - minValue)) * plotHeight;

  drawCurve(samples, (sample) => ({ x: toX(sample.error), y: toY(sample.value) }));

  const marker = { x: toX(currentError), y: toY(currentValue) };
  drawMarker(marker);
  if (!ghost) {
    drawPlotArrow(marker, delta, 1, ARROW_BLUE);
  }
}

function drawPlotAxes({
  plotLeft,
  plotTop,
  plotWidth,
  plotHeight,
  horizontalLabel,
  verticalLabel,
  xAxis,
  verticalLabelAt,
}: {
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  horizontalLabel: string;
  verticalLabel: string;
  xAxis: 'bottom' | 'top';
  verticalLabelAt: 'top' | 'bottom';
}) {
  const oldLineWidth = ctx.lineWidth;
  ctx.lineWidth = 1;
  ctx.strokeStyle = PLOT_AXIS;
  ctx.beginPath();
  if (xAxis === 'bottom') {
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft, plotTop + plotHeight);
    ctx.lineTo(plotLeft + plotWidth, plotTop + plotHeight);
  } else {
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft + plotWidth, plotTop);
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft, plotTop + plotHeight);
  }
  ctx.stroke();
  ctx.lineWidth = oldLineWidth;

  ctx.fillStyle = PLOT_AXIS;
  ctx.font = AXIS_LABEL_FONT;
  const oldTextAlign = ctx.textAlign;
  const oldTextBaseline = ctx.textBaseline;
  if (xAxis === 'bottom') {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(horizontalLabel, plotLeft + plotWidth, plotTop + plotHeight + 4);
  } else {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(horizontalLabel, plotLeft + plotWidth, plotTop - 4);
  }

  ctx.save();
  ctx.translate(plotLeft - 10, verticalLabelAt === 'top' ? plotTop : plotTop + plotHeight);
  ctx.rotate(-Math.PI / 2);
  if (verticalLabelAt === 'top') {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(verticalLabel, 0, 0);
  } else {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(verticalLabel, 0, 0);
  }
  ctx.restore();
  ctx.textAlign = oldTextAlign;
  ctx.textBaseline = oldTextBaseline;
}

function drawCurve(samples: { value: number; error: number }[], toPoint: (sample: { value: number; error: number }) => Position) {
  const oldLineWidth = ctx.lineWidth;
  ctx.lineWidth = 1;
  ctx.strokeStyle = PLOT_CURVE;
  ctx.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const { x, y } = toPoint(samples[i]);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.lineWidth = oldLineWidth;
}

function drawMarker(pos: Position) {
  ctx.fillStyle = PLOT_MARKER;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlotArrow(marker: Position, delta: number, axis: 0 | 1, color: string) {
  if (delta === 0) {
    return;
  }

  const sign = delta > 0 ? 1 : -1;
  const end =
    axis === 0
      ? { x: marker.x + sign * ARROW_LENGTH, y: marker.y }
      : { x: marker.x, y: marker.y - sign * ARROW_LENGTH };

  drawArrow(marker, end, color);
}
