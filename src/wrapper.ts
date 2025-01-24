// APIs for communicating with the wrapper

const wrapper = (window as any).webkit?.messageHandlers;

export const available = (window as any).webkit != null;

export function send(fn: string, msg: any = fn) {
  if (available) {
    wrapper[fn].postMessage(msg);
  }
}
