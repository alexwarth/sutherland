import config from './config';
import scope from './scope';
import { Drawing } from './Drawing';
import { Position } from './helpers';

import rawJson from './yoshikis-font-data.json';

type Command =
  | { command: 'line'; start: Position; end: Position }
  | {
      command: 'arc';
      center: Position;
      radius: number;
      start: number;
      end: number;
    };

export function applyTo(drawing: Drawing, commands: Command[], scale = config().fontScale) {
  for (const command of commands) {
    switch (command.command) {
      case 'line': {
        const start = pointTimes(command.start, scale);
        const end = pointTimes(command.end, scale);
        drawing.addLine(start, end, false, false);
        break;
      }
      case 'arc': {
        const center = pointTimes(command.center, scale);
        const radius = command.radius * scale;
        drawing.addArc(
          pointPlusPolarVector(center, command.end, radius),
          pointPlusPolarVector(center, command.start, radius),
          center,
          false,
        );
        break;
      }
      default:
        console.log('unsupported letter-drawing command', command);
        break;
    }
  }
}

const commandsByLetter = new Map<string, Command[]>(rawJson.data.values as any);

// console.log(commandsByLetter);

export const letterDrawings = new Map<string, Drawing>();
for (const [letter, commands] of commandsByLetter) {
  const drawing = new Drawing();
  applyTo(drawing, commands, config().fontScale);
  const line = drawing.addLine(
    { x: -config().kerning * config().fontScale, y: 0 },
    { x: (4 + config().kerning) * config().fontScale, y: 0 },
    true,
  );
  drawing.attachers.push(line.a, line.b);
  letterDrawings.set(letter, drawing);
}

export function lettersDo(
  msg: string,
  scale: number,
  fn: (letter: Drawing, x: number, ls: number) => void,
) {
  const letterScale = (l: string) => scale * (l === l.toUpperCase() ? 1 : 0.75);
  const letterWidth = (l: string) =>
    letterScale(l) * config().fontScale * (4 + config().kerning * 2);
  let x = scope.center.x - 0.5 * [...msg].map(letterWidth).reduce((a, b) => a + b, 0);
  for (let idx = 0; idx < msg.length; idx++) {
    const l = msg[idx];
    const ls = letterScale(l);
    const letter = letterDrawings.get(l.toUpperCase());
    if (letter) {
      fn(letter, x, ls);
    }
    x += letterWidth(l);
  }
}

// helpers

function pointTimes({ x, y }: Position, m: number): Position {
  return { x: x * m, y: y * m };
}

function pointPlusPolarVector({ x, y }: Position, theta: number, dist: number): Position {
  return {
    x: x + dist * Math.cos(theta),
    y: y + dist * Math.sin(theta),
  };
}
