import scope from './scope';
import { ctx, drawLine } from './canvas';
import ConstraintSet from './ConstraintSet';
import { Drawing } from './Drawing';
import { Position } from './helpers';
import { Handle } from './things';
import { Var } from './state';

const ARROW_YELLOW = 'rgba(255, 220, 50, 0.85)';
const ARROW_BLUE = 'rgba(80, 160, 255, 0.95)';
const PLOT_CURVE = 'rgba(255, 200, 60, 0.95)';
const PLOT_AXIS = 'rgba(180, 180, 180, 0.75)';
const PLOT_MARKER = 'rgba(255, 255, 255, 0.9)';

const ARROW_LENGTH = 22;
const SAMPLE_COUNT = 80;
const AXIS_LABEL_PAD = 18;
const AXIS_LABEL_FONT = '11px system-ui, sans-serif';

let enabled = false;

export function isEnabled() {
  return enabled;
}

export function toggle() {
  enabled = !enabled;
  return enabled;
}

export function render(drawing: Drawing, penPos: Position | null) {
  if (!enabled || drawing.isEmpty()) {
    return;
  }

  const hovered = penPos ? drawing.handleAt(penPos) : null;
  const deltas = collectDeltas(drawing);

  forEachHandle(drawing, (handle) => {
    const [xVar, yVar] = handleVars(handle);
    const color = handle === hovered ? ARROW_BLUE : ARROW_YELLOW;
    drawAxisArrow(handle, deltas.get(xVar) ?? 0, 0, color);
    drawAxisArrow(handle, deltas.get(yVar) ?? 0, 1, color);
  });

  if (hovered) {
    const [xVar, yVar] = handleVars(hovered);
    renderHoverPlots(drawing.constraints, hovered, xVar, yVar, deltas);
  }
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
  constraints: ConstraintSet,
  handle: Handle,
  xVar: Var<number>,
  yVar: Var<number>,
  deltas: Map<Var<number>, number>,
) {
  const size = Math.min(innerWidth, innerHeight);
  const panelWidth = size / 3;
  const panelLeft = innerWidth - panelWidth;
  const margin = 12;
  const xLabelSpace = 16;
  const plotGap = 28;
  const plotOuterWidth = panelWidth - margin * 2;
  const plotChartSize = plotOuterWidth - AXIS_LABEL_PAD;

  const xPlotTop = margin;
  const yPlotTop = margin + plotChartSize + xLabelSpace + plotGap;

  const epsilon = scope.scale > 0 ? 1 / scope.scale : 1;
  const span = Math.max(epsilon * 80, 1);

  drawValueVsErrorPlot({
    left: panelLeft + margin,
    top: xPlotTop,
    width: plotOuterWidth,
    height: plotChartSize,
    valueLabel: 'x',
    errorLabel: 'Σe²',
    var: xVar,
    currentValue: handle.x,
    delta: deltas.get(xVar) ?? 0,
    constraints,
    minValue: handle.x - span,
    maxValue: handle.x + span,
    arrowAxis: 0,
  });

  drawErrorVsValuePlot({
    left: panelLeft + margin,
    top: yPlotTop,
    width: plotOuterWidth,
    height: plotChartSize,
    valueLabel: 'y',
    errorLabel: 'Σe²',
    var: yVar,
    currentValue: handle.y,
    delta: deltas.get(yVar) ?? 0,
    constraints,
    minValue: handle.y - span,
    maxValue: handle.y + span,
  });
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

function errorBounds(samples: { error: number }[], currentError: number) {
  let maxError = currentError;
  for (const { error } of samples) {
    maxError = Math.max(maxError, error);
  }
  if (maxError <= 0) {
    maxError = 1;
  }
  return { minError: 0, maxError };
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
  arrowAxis,
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
  arrowAxis: 0 | 1;
}) {
  const samples = sampleSquaredError(constraints, v, minValue, maxValue, SAMPLE_COUNT);
  const currentError = constraints.totalSquaredError();
  const { minError, maxError } = errorBounds(samples, currentError);

  const plotTop = top;
  const plotHeight = height;
  const plotLeft = left + AXIS_LABEL_PAD;
  const plotWidth = width - AXIS_LABEL_PAD;

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

  const toX = (value: number) =>
    plotLeft + ((value - minValue) / (maxValue - minValue)) * plotWidth;
  const toY = (error: number) =>
    plotTop + plotHeight - ((error - minError) / (maxError - minError)) * plotHeight;

  drawCurve(samples, (sample) => ({ x: toX(sample.value), y: toY(sample.error) }));

  const marker = { x: toX(currentValue), y: toY(currentError) };
  drawMarker(marker);
  drawPlotArrow(marker, delta, arrowAxis, ARROW_BLUE);
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
}) {
  const samples = sampleSquaredError(constraints, v, minValue, maxValue, SAMPLE_COUNT);
  const currentError = constraints.totalSquaredError();
  const { minError, maxError } = errorBounds(samples, currentError);

  const plotTop = top;
  const plotHeight = height;
  const plotLeft = left + AXIS_LABEL_PAD;
  const plotWidth = width - AXIS_LABEL_PAD;

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

  const toX = (error: number) =>
    plotLeft + ((error - minError) / (maxError - minError)) * plotWidth;
  const toY = (value: number) =>
    plotTop + plotHeight - ((value - minValue) / (maxValue - minValue)) * plotHeight;

  drawCurve(samples, (sample) => ({ x: toX(sample.error), y: toY(sample.value) }));

  const marker = { x: toX(currentError), y: toY(currentValue) };
  drawMarker(marker);
  drawPlotArrow(marker, delta, 1, ARROW_BLUE);
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
