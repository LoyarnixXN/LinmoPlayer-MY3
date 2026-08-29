import type { PlaybackResource, UnifiedSong } from './models';

export interface AudioEngine {
  load(resource: PlaybackResource): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  unload(): Promise<void>;
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface PlayerSnapshot {
  readonly status: PlayerStatus;
  readonly song: UnifiedSong | null;
  readonly positionMs: number;
  readonly durationMs: number;
  readonly queue: readonly UnifiedSong[];
  readonly queueIndex: number;
  readonly errorMessage: string | null;
}

export class PlayerController {
  private snapshot: PlayerSnapshot = {
    status: 'idle',
    song: null,
    positionMs: 0,
    durationMs: 0,
    queue: [],
    queueIndex: -1,
    errorMessage: null,
  };

  public constructor(private readonly audio: AudioEngine) {}

  public getState(): PlayerSnapshot {
    return this.snapshot;
  }

  public setQueue(queue: readonly UnifiedSong[], startIndex = 0): void {
    const song = queue[startIndex] ?? null;
    this.snapshot = {
      ...this.snapshot,
      queue,
      queueIndex: song ? startIndex : -1,
      song,
      positionMs: 0,
      durationMs: song?.durationMs ?? 0,
      status: 'idle',
    };
  }

  public async play(resource: PlaybackResource): Promise<void> {
    if (!this.snapshot.song) return;
    this.snapshot = { ...this.snapshot, status: 'loading', errorMessage: null };
    try {
      await this.audio.load(resource);
      await this.audio.play();
      this.snapshot = { ...this.snapshot, status: 'playing' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to play this song.';
      this.snapshot = { ...this.snapshot, status: 'error', errorMessage };
    }
  }

  public async pause(): Promise<void> {
    await this.audio.pause();
    this.snapshot = { ...this.snapshot, status: 'paused' };
  }

  public async seekTo(positionMs: number): Promise<void> {
    await this.audio.seekTo(positionMs);
    this.snapshot = { ...this.snapshot, positionMs };
  }

  public async next(): Promise<void> {
    const nextIndex = this.snapshot.queueIndex + 1;
    const song = this.snapshot.queue[nextIndex];
    if (!song) return;
    await this.audio.unload();
    this.snapshot = {
      ...this.snapshot,
      queueIndex: nextIndex,
      song,
      positionMs: 0,
      durationMs: song.durationMs ?? 0,
      status: 'idle',
    };
  }
}
