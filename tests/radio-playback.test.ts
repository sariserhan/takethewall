// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RadioPlayback } from "@/lib/radio-playback";
class Deck {
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dataset: Record<string,string> = {};
  src = "";
  paused = true;
  fail = false;
  play = vi.fn(async () => { if (this.fail) throw new Error("unavailable"); this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  removeAttribute = vi.fn();
  load = vi.fn();
}
const gains: { gain: { value: number; cancelScheduledValues: ReturnType<typeof vi.fn>; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn> }[] = [];
class Context {
  currentTime = 0;
  destination = {};
  createGain() {
    const node = { gain:{value:0,cancelScheduledValues:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()},connect:vi.fn() };
    gains.push(node); return node;
  }
  createMediaElementSource() { return {connect:vi.fn()}; }
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
}
beforeEach(() => { gains.length = 0; vi.useFakeTimers(); vi.stubGlobal("AudioContext", Context); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const decks = [new Deck(),new Deck()]; const update = vi.fn();
  return { decks, update, player:new RadioPlayback(decks as unknown as HTMLAudioElement[],update) };
}
describe("radio transitions", () => {
  it("does not load or play until requested", () => {
    const {decks} = setup(); expect(gains).toHaveLength(0); expect(decks.every(d=>!d.src&&d.paused)).toBe(true);
  });
  it("crossfades over 750ms and stops the outgoing deck", async () => {
    const {player,decks} = setup(); await player.play("lofi"); await player.play("rain");
    expect(decks.every(d=>!d.paused)).toBe(true);
    expect(gains[2].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0,.75);
    expect(gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(1,.75);
    vi.advanceTimersByTime(800); expect(decks[1].paused).toBe(true); expect(decks[0].paused).toBe(false);
  });
  it("keeps the old track playing if the next one fails", async () => {
    const {player,decks,update} = setup(); await player.play("lofi"); decks[0].fail=true; await player.play("rain");
    expect(decks[1].paused).toBe(false); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({playing:true,loading:false,channel:"lofi",error:expect.any(String)}));
  });
  it("pause cancels both decks and a pending fade", async () => {
    const {player,decks} = setup(); await player.play("lofi"); await player.play("rain"); player.pause(); vi.runAllTimers(); expect(decks.every(d=>d.paused)).toBe(true);
  });
  it("rapid switching leaves only the latest channel playing", async () => {
    const {player,decks} = setup(); await player.play("lofi"); await player.play("rain"); await player.play("jazz"); vi.runAllTimers();
    expect(decks.filter(d=>!d.paused).map(d=>d.src)).toEqual(["/api/radio/jazz"]);
  });
  it("uses one volume control across both decks", async () => {
    const {player} = setup(); player.setVolume(.12); await player.play("lofi"); await player.play("rain"); expect(gains[0].gain.value).toBe(.12); player.setVolume(0); expect(gains[0].gain.value).toBe(0);
  });
});
