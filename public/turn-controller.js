// A pause is application state, not a request in the model's prompt.
export class TurnController {
  constructor({ delay = 5000, respond, interrupt, changed = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
    Object.assign(this, { delay, respond, interrupt, changed, setTimer, clearTimer });
    this.version = 0; this.active = false; this.held = false; this.muted = false;
    this.speaking = false; this.pending = new Set(); this.wantsReply = false;
    this.ready = false; this.requested = false;
  }
  start() { this.active = true; this.publish(); }
  invalidate() { this.version++; this.clearTimer(this.timer); this.timer = null; this.ready = false; }
  speechStart() {
    if (!this.active) return;
    this.invalidate(); this.speaking = true; this.requested = false; this.wantsReply = false;
    this.interrupt(); this.publish();
  }
  speechStop(id) {
    if (!this.active) return;
    this.speaking = false; this.wantsReply = true;
    if (id) this.pending.add(id);
    this.schedule();
  }
  transcriptDone(id) { this.pending.delete(id); this.tryReply(); }
  schedule() {
    this.invalidate();
    if (!this.active || this.held || this.muted || this.speaking || !this.wantsReply) { this.publish(); return; }
    const version = this.version;
    this.timer = this.setTimer(() => { if (version !== this.version) return; this.ready = true; this.tryReply(); }, this.delay);
    this.publish();
  }
  tryReply() {
    if (!this.active || this.held || this.muted || this.speaking || this.pending.size || !this.ready || !this.wantsReply || this.requested) return;
    this.wantsReply = false; this.requested = true; this.ready = false;
    this.respond(); this.publish();
  }
  hold() { this.held = true; this.invalidate(); this.requested = false; this.interrupt(); this.publish(); }
  giveFloor() {
    this.held = false; this.invalidate();
    if (!this.speaking) { this.wantsReply = true; this.ready = true; this.tryReply(); }
    this.publish();
  }
  mute(value) { this.muted = value; this.invalidate(); if (value) { this.requested = false; this.interrupt(); } else this.schedule(); this.publish(); }
  responseDone() { this.requested = false; this.publish(); }
  stop() { this.active = false; this.invalidate(); this.pending.clear(); this.publish(); }
  publish() { this.changed({ active: this.active, held: this.held, muted: this.muted, speaking: this.speaking, thinking: this.wantsReply, requested: this.requested }); }
}
