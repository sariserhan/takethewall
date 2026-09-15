export type RadioPlaybackState = { playing: boolean; loading: boolean; error: string; channel?: string };
const FADE_SECONDS = 0.75;
/** Two audio decks share a master volume so channel changes can overlap briefly. */
export class RadioPlayback {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private gains: GainNode[] = [];
  private current = 0;
  private generation = 0;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  private volume = 0.35;
  private channels: (string | undefined)[] = [];
  private disposed = false;
  private pending = false;
  private listeners: (() => void)[] = [];
  constructor(private decks: HTMLAudioElement[], private update: (state: RadioPlaybackState) => void) {
    decks[0].dataset.active = "true";
    decks[1].dataset.active = "false";
    decks.forEach((deck, index) => {
      const waiting = () => {
        if (!this.pending && index === this.current && !deck.paused)
          this.update({ playing:true, loading:true, error:"" });
      };
      const ready = () => {
        if (!this.pending && index === this.current && !deck.paused)
          this.update({ playing:true, loading:false, error:"" });
      };
      const failed = () => {
        if (!this.pending && index === this.current)
          this.update({ playing:false, loading:false, error:"Playback was interrupted. Try Play again or choose another channel." });
      };
      deck.addEventListener("waiting", waiting);
      deck.addEventListener("playing", ready);
      deck.addEventListener("error", failed);
      this.listeners.push(() => {
        deck.removeEventListener("waiting", waiting);
        deck.removeEventListener("playing", ready);
        deck.removeEventListener("error", failed);
      });
    });
  }
  private connect() {
    if (this.context) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.context.destination);
    this.gains = this.decks.map(deck => {
      const gain = this.context!.createGain();
      gain.gain.value = 0;
      this.context!.createMediaElementSource(deck).connect(gain);
      gain.connect(this.master!);
      return gain;
    });
  }
  private settle() {
    clearTimeout(this.fadeTimer);
    this.gains.forEach((node, index) => {
      node.gain.cancelScheduledValues(this.context!.currentTime);
      node.gain.setValueAtTime(index === this.current ? 1 : 0, this.context!.currentTime);
      if (index !== this.current) this.decks[index].pause();
    });
  }
  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master) this.master.gain.value = this.volume;
  }
  async play(channel: string) {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.pending = true;
    const old = this.current;
    let target = old;
    const wasPlaying = !this.decks[old].paused;
    try {
      this.connect();
      this.settle();
      target = this.channels[old] === channel ? old : 1 - old;
      const deck = this.decks[target];
      if (this.channels[target] !== channel) {
        deck.src = `/api/radio/${channel}`;
        this.channels[target] = channel;
      }
      this.gains[target].gain.value = target === old ? 1 : 0;
      this.update({ playing:wasPlaying, loading:true, error:"" });
      // Both calls start within the user's activation; the old deck keeps playing while loading.
      await Promise.all([this.context!.resume(), deck.play()]);
      if (generation !== this.generation || this.disposed) return;
      this.pending = false;
      this.current = target;
      this.decks.forEach((element, index) => { element.dataset.active = String(index === target); });
      const now = this.context!.currentTime;
      if (target !== old && wasPlaying) {
        this.gains[old].gain.setValueAtTime(1, now);
        this.gains[old].gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
        this.gains[target].gain.setValueAtTime(0, now);
        this.gains[target].gain.linearRampToValueAtTime(1, now + FADE_SECONDS);
        this.fadeTimer = setTimeout(() => {
          if (generation === this.generation) this.decks[old].pause();
        }, FADE_SECONDS * 1000 + 50);
      } else {
        this.gains[target].gain.setValueAtTime(1, now);
        if (target !== old) this.decks[old].pause();
      }
      this.update({ playing:true, loading:false, error:"", channel });
    } catch {
      if (generation !== this.generation || this.disposed) return;
      this.pending = false;
      if (target !== old) this.decks[target].pause();
      this.update({ playing:!this.decks[old].paused, loading:false,
        error:"Couldn’t play this channel. Try again or tune to another.",
        channel:wasPlaying ? this.channels[old] : undefined });
    }
  }
  pause() {
    this.generation++;
    this.pending = false;
    clearTimeout(this.fadeTimer);
    this.decks.forEach(deck => deck.pause());
    this.settle();
    if (!this.disposed) this.update({ playing:false, loading:false, error:"" });
  }
  dispose() {
    this.disposed = true;
    this.listeners.forEach(remove => remove());
    this.pause();
    this.decks.forEach(deck => { deck.removeAttribute("src"); deck.load(); });
    void this.context?.close().catch(() => {});
  }
}
