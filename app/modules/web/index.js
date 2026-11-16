// `<zoom-pinch>` on the web: moves the app asks for, with the events Zoom.swift sends ("b", "m" each
// frame, "e" at the stop). A browser's pinch stays the browser's.
export const abi = 1;
export const roster = { 'zoom-pinch': { snapshot: false } };

class Pinch {
  constructor(props, event) {
    this.event = event;
    this.z = Number(props.level) || 2;
    this.ask = props.ask ?? '';
    this.frame = 0;
  }
  setProps(props) {
    const ask = props.ask ?? '';
    const stop = Number(ask.split('#')[0]);
    if (ask === this.ask || !stop) return;
    this.ask = ask;
    cancelAnimationFrame(this.frame);
    this.event(1, `b ${this.z} -1 -1`);
    if (props.still === 'true') return this.land(stop);
    const from = this.z, start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / 250, 1), eased = 1 - (1 - t) ** 3;
      this.z = from + (stop - from) * eased;
      if (t < 1) { this.event(1, `m ${this.z} -1`); this.frame = requestAnimationFrame(step); } else this.land(stop);
    };
    this.frame = requestAnimationFrame(step);
  }
  land(stop) { this.z = stop; this.event(1, `e ${stop}`); }
  destroy() { cancelAnimationFrame(this.frame); }
}

export function create(_tag, _element, json, event) { return new Pinch(JSON.parse(json), event); }
export function setProps(pinch, json) { pinch.setProps(JSON.parse(json)); }
export function destroy(pinch) { pinch.destroy(); }
