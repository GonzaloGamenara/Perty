import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Room } from '../src/room';

/**
 * Quién manda en la sala no es un detalle: es el único que puede armar y
 * arrancar la partida desde su celular. Si la corona queda en el lugar
 * equivocado, la noche no empieza.
 */

function makeRoom(): Room {
  return new Room('TEST', 'http://ejemplo/j?c=TEST', {
    onChange: () => {},
    onSfx: () => {},
    onTakeover: () => {},
  });
}

function add(room: Room, name: string, isBot = false): string {
  const result = room.addPlayer(name, { isBot });
  if ('error' in result) throw new Error(result.error);
  return result.player.id;
}

const vipName = (room: Room) => room.players.find((player) => player.isVip)?.name ?? null;

describe('quién manda en la sala', () => {
  it('el primero que entra manda', () => {
    const room = makeRoom();
    add(room, 'ana');
    add(room, 'beto');
    assert.equal(vipName(room), 'ana');
  });

  it('un bot nunca manda, aunque haya entrado primero', () => {
    const room = makeRoom();
    add(room, 'Robo-Tito', true);
    assert.equal(vipName(room), null, 'con solo bots no manda nadie');

    add(room, 'ana');
    assert.equal(vipName(room), 'ana', 'el humano tiene que quedarse la corona');
  });

  it('los bots que entran después no le sacan la corona a nadie', () => {
    const room = makeRoom();
    add(room, 'ana');
    add(room, 'Botina', true);
    add(room, 'Chip', true);
    assert.equal(vipName(room), 'ana');
  });

  it('si se va el que manda, la corona pasa a otro humano', () => {
    const room = makeRoom();
    const ana = add(room, 'ana');
    add(room, 'Robo-Tito', true);
    add(room, 'beto');

    room.removePlayer(ana);
    assert.equal(vipName(room), 'beto', 'la corona saltó a un bot o se perdió');
  });

  it('si solo quedan bots, la corona queda vacante', () => {
    const room = makeRoom();
    const ana = add(room, 'ana');
    add(room, 'Botina', true);

    room.removePlayer(ana);
    assert.equal(vipName(room), null);
  });

  it('los bots quedan marcados como tales', () => {
    const room = makeRoom();
    add(room, 'ana');
    add(room, 'Botina', true);
    assert.deepEqual(
      room.bots.map((bot) => bot.name),
      ['Botina'],
    );
  });
});
