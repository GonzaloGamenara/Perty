import { randomRoomCode, Room, type RoomHooks } from '@perty/engine';
import type { RoomCode } from '@perty/protocol';

const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas: una junta larga entra cómoda

export class RoomStore {
  private readonly rooms = new Map<RoomCode, Room>();

  constructor(
    private readonly hooks: RoomHooks,
    private readonly joinUrlFor: (code: RoomCode) => string,
  ) {
    setInterval(() => this.sweep(), 15 * 60 * 1000).unref();
  }

  create(): Room {
    let code = randomRoomCode();
    while (this.rooms.has(code)) code = randomRoomCode();
    const room = new Room(code, this.joinUrlFor(code), this.hooks);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string | undefined | null): Room | null {
    if (!code) return null;
    return this.rooms.get(code.trim().toUpperCase()) ?? null;
  }

  close(code: RoomCode): void {
    this.rooms.get(code)?.dispose();
    this.rooms.delete(code);
  }

  get size(): number {
    return this.rooms.size;
  }

  private sweep(): void {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [code, room] of this.rooms) {
      if (room.createdAt < cutoff) {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }
}
