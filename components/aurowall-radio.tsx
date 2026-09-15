"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { radioChannels, radioChannelName, type RadioChannel } from "@/lib/radio-channels";
import { clearRadioEffects, radioEffectEvent, type RadioEffect } from "@/lib/radio-effects";
import { wallSoundEnabled } from "./use-wall-sound";
import { RadioPlayback } from "@/lib/radio-playback";
import { useRadioMatching, radioMatchingEnabled, setRadioMatching, radioMatchingEvent } from "./use-radio-matching";
import { useVisibleAnimation } from "./use-visible-animation";
import styles from "./aurowall-radio.module.css";
const presets: RadioChannel[] = ["lofi", "jazz", "deep-focus", "ambient", "rain", "forest", "waves", "synthwave"];
export function AurowallRadio() {
  const animation = useVisibleAnimation();
  const audio = useRef<HTMLAudioElement>(null);
  const secondAudio = useRef<HTMLAudioElement>(null);
  const playback = useRef<RadioPlayback | null>(null);
  const matching = useRadioMatching();
  const latestEffect = useRef<RadioEffect | null>(null);
  const [channel, setChannel] = useState<RadioChannel>("lofi");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [volume, setVolume] = useState(35);
  const [error, setError] = useState("");
  const effectPlayback = useRef(false);
  const [matchedEffect, setMatchedEffect] = useState<string | null>(null);
  const followEffect = useEffectEvent((effect: RadioEffect | null) => {
    latestEffect.current = effect;
    if (!radioMatchingEnabled()) {
      effectPlayback.current = false; setMatchedEffect(null);
      return;
    }
    if (!effect) {
      if (effectPlayback.current) pause();
      effectPlayback.current = false;
      setMatchedEffect(null);
      return;
    }
    effectPlayback.current = true;
    setMatchedEffect(effect.label);
    setChannel(effect.channel);
    if (wallSoundEnabled()) void play(effect.channel);
    else pause();
  });
  const followSound = useEffectEvent(() => {
    if (!effectPlayback.current) return;
    if (wallSoundEnabled()) void play(channel);
    else pause();
  });
  const followMatching = useEffectEvent(() => {
    if (!radioMatchingEnabled()) {
      effectPlayback.current = false; setMatchedEffect(null);
    } else if (latestEffect.current) followEffect(latestEffect.current);
  });
  useEffect(() => {
    const matchingChanged = () => followMatching();
    const effect = (event: Event) => followEffect((event as CustomEvent<RadioEffect | null>).detail);
    const sound = () => followSound();
    const stored = (event: StorageEvent) => { if (event.key === "ttw-sound" || event.key === null) followSound(); if (event.key === "ttw-radio-match" || event.key === null) followMatching(); };
    window.addEventListener(radioMatchingEvent, matchingChanged);
    window.addEventListener(radioEffectEvent, effect);
    window.addEventListener("ttw-sound-change", sound);
    window.addEventListener("storage", stored);
    return () => {
      window.removeEventListener(radioMatchingEvent, matchingChanged);
      window.removeEventListener(radioEffectEvent, effect);
      window.removeEventListener("ttw-sound-change", sound);
      window.removeEventListener("storage", stored);
      clearRadioEffects();
    };
  }, []);
  useEffect(() => {
    if (!audio.current || !secondAudio.current) return;
    const player = new RadioPlayback([audio.current, secondAudio.current], state => {
      setPlaying(state.playing); setLoading(state.loading); setError(state.error);
      if (state.channel) setChannel(state.channel as RadioChannel);
    });
    playback.current = player;
    return () => { player.dispose(); playback.current = null; };
  }, []);
  function play(next = channel) { return playback.current?.play(next); }
  function pause() { playback.current?.pause(); }
  function tune(next: RadioChannel) {
    effectPlayback.current = false; setMatchedEffect(null);
    setChannel(next); setError("");
    if (playing || loading) void play(next);
  }
  function shuffle() {
    const others = radioChannels.filter(value => value !== channel);
    tune(others[Math.floor(Math.random() * others.length)]);
  }
  return (
    <section ref={animation} className={styles.radio} aria-label="Aurowall Radio">
      <div className={styles.intro}>
        <span className={styles.eyebrow}>AUROWALL RADIO · {radioChannels.length} CHANNELS</span>
        <h2>A soundtrack for your stay.</h2>
        <p>Music, focus, and sounds from nature. Tune in and make yourself at home.</p>
        <a href="https://aurowall.com" target="_blank" rel="noopener noreferrer">Powered by <strong>aurowall.com</strong> ↗</a>
      </div>
      <div className={styles.player}>
        <div className={styles.nowPlaying}>
          <span className={styles.equalizer} data-playing={playing && !loading} aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <div><span>{loading ? "TUNING IN" : playing ? "NOW PLAYING" : "READY WHEN YOU ARE"}</span><strong>{radioChannelName(channel)}</strong></div>
        </div>
        {matchedEffect && <p className={styles.matched}>Matched to {matchedEffect} · change the channel anytime</p>}
        <div className={styles.controls}>
          <button className={styles.play} type="button" onClick={() => { effectPlayback.current = false; setMatchedEffect(null); if (playing || loading) pause(); else void play(); }} aria-label={playing || loading ? "Pause radio" : "Play radio"}>{playing || loading ? "Ⅱ Pause" : "▶ Play"}</button>
          <button type="button" onClick={() => tune(radioChannels[(radioChannels.indexOf(channel) + 1) % radioChannels.length])} aria-label="Next radio channel">Next →</button>
          <button type="button" onClick={shuffle} aria-label="Shuffle radio channel">Shuffle ⤨</button>
          <label className={styles.volume}>Volume<input type="range" min="0" max="100" value={volume} aria-valuetext={`${volume}%`} onChange={event => { const value = Number(event.target.value); setVolume(value); playback.current?.setVolume(value / 100); }} /></label>
        </div>
        <label className={styles.matching}>
          <input type="checkbox" role="switch" checked={matching} onChange={event => setRadioMatching(event.target.checked)} />
          <span>Match music to effects</span>
        </label>
        <label className={styles.channels}>Find your channel<select value={channel} onChange={event => tune(event.target.value as RadioChannel)}>{radioChannels.map(value => <option key={value} value={value}>{radioChannelName(value)}</option>)}</select></label>
        <div className={styles.presets} aria-label="Suggested radio channels">{presets.map(value => <button type="button" key={value} aria-pressed={channel === value} onClick={() => tune(value)}>{radioChannelName(value)}</button>)}</div>
        <p className={styles.error} role="status">{error}</p>
      </div>
      <audio ref={audio} preload="none" loop />
      <audio ref={secondAudio} preload="none" loop />
    </section>
  );
}
