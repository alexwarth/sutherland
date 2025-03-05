import { Thing } from './things';
import { ctx } from './canvas';
import { easeOutQuint } from './helpers';
import { Var } from './state';
import scope from './scope';
import config from './config';

const message = new Var<string>('');
const referents = new Var<WeakRef<Thing>[] | null>(null);

let numSets = 0;

export function set(msg: string, ...things: Thing[]) {
  message.value = msg;
  referents.value = things.length === 0 ? null : things.map((t) => new WeakRef(t));
  numSets++;
}

let lastNumSets = 0;
let lastMessage = message.value;
let lastReferents = referents.value;
let lastStatusTimeMillis = 0;

let pos: 'top' | 'bottom' = 'bottom';

export function setPos(newPos: 'top' | 'bottom') {
  pos = newPos;
}

export function render() {
  const now = Date.now();
  if (
    numSets !== lastNumSets ||
    message.value !== lastMessage ||
    referents.value !== lastReferents
  ) {
    lastNumSets = numSets;
    lastMessage = message.value;
    lastReferents = referents.value;
    lastStatusTimeMillis = now;
  }

  const statusAgeMillis = now - lastStatusTimeMillis;
  if (statusAgeMillis > config().statusTimeMillis) {
    return;
  }

  const fontSizeInPixels = 40;
  ctx.font = `${fontSizeInPixels}px Monaco`;
  const width = ctx.measureText(message.value).width;
  const alpha = 1 - easeOutQuint(statusAgeMillis / config().statusTimeMillis);
  ctx.fillStyle = `rgba(255,222,33,${alpha})`;
  ctx.fillText(
    message.value,
    (innerWidth - width) / 2,
    pos === 'top' ? 1.2 * fontSizeInPixels : innerHeight - fontSizeInPixels,
  );

  if (config().highlightReferents && referents.value) {
    const alpha = 1 - easeOutQuint(statusAgeMillis / (0.5 * config().statusTimeMillis));
    const color = `rgba(255,222,33,${alpha})`;
    for (const thingRef of referents.value) {
      const thing = thingRef.deref();
      thing?.render(scope.toScreenPosition, color, 2);
    }
  }
}
