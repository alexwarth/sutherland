// APIs for communicating with the wrapper

import { setStatus } from './canvas';

const wrapper = (window as any).webkit?.messageHandlers;

export const available = (window as any).webkit != null;

export function send(fn: string, msg: any = fn) {
  if (available) {
    setStatus(wrapper[fn]);
    wrapper[fn].postMessage(msg);
  }
}
