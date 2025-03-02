import { Thing } from './things';
import { ctx } from './canvas';
import config from './config';
import { easeOutQuint } from './helpers';
import scope from './scope';
import { Var } from './state';

const message = new Var<string>('');
const referents = new Var<WeakRef<Thing>[]>([]);
const statusTimeMillis = new Var<number>(0);

export function set(msg: string, ...things: Thing[]) {
  message.value = msg;
  referents.value = things.map((t) => new WeakRef(t));
  statusTimeMillis.value = Date.now();
}

export function render() {
  const statusAgeMillis = Date.now() - statusTimeMillis.value;
  if (statusAgeMillis > config().statusTimeMillis) {
    return;
  }

  const fontSizeInPixels = 40;
  ctx.font = `${fontSizeInPixels}px Monaco`;
  const width = ctx.measureText(message.value).width;
  const alpha = 1 - easeOutQuint(statusAgeMillis / config().statusTimeMillis);
  ctx.fillStyle = `rgba(255,222,33,${alpha})`;
  ctx.fillText(message.value, (innerWidth - width) / 2, innerHeight - fontSizeInPixels);

  if (config().highlightReferents) {
    const alpha = 1 - easeOutQuint(statusAgeMillis / (0.5 * config().statusTimeMillis));
    const color = `rgba(255,222,33,${alpha})`;
    for (const thingRef of referents.value) {
      const thing = thingRef.deref();
      thing?.render(scope.toScreenPosition, color, 2);
    }
  }
}
