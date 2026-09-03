import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { joinUrl, originFromHeaders, type NetConfig } from '../src/net';

/**
 * De esto depende que el QR de la tele sea escaneable. Si se rompe, el juego
 * "anda" pero nadie puede entrar, que es la peor forma de fallar.
 */

const prod: NetConfig = {
  port: 3000,
  isProd: true,
  controllerDevPort: 5174,
  publicBase: null,
};

describe('de dónde sale el origen', () => {
  it('usa la cabecera Origin cuando está', () => {
    assert.equal(originFromHeaders({ origin: 'https://perty.onrender.com' }), 'https://perty.onrender.com');
  });

  it('detrás de un proxy arma el origen con las x-forwarded', () => {
    const origin = originFromHeaders({
      host: 'localhost:3000',
      'x-forwarded-host': 'perty.fly.dev',
      'x-forwarded-proto': 'https',
    });
    assert.equal(origin, 'https://perty.fly.dev');
  });

  it('sin proxy se conforma con el Host', () => {
    assert.equal(originFromHeaders({ host: '192.168.1.36:3000' }), 'http://192.168.1.36:3000');
  });

  it('sin cabeceras útiles devuelve null', () => {
    assert.equal(originFromHeaders({}), null);
  });
});

describe('URL para el celular', () => {
  it('el override manual manda sobre todo lo demás', () => {
    const config = { ...prod, publicBase: 'https://juegos.midominio.com/' };
    assert.equal(
      joinUrl(config, 'ABCD', 'https://otro-lado.com'),
      'https://juegos.midominio.com/j?c=ABCD',
    );
  });

  it('en producción usa la URL por la que entró la tele', () => {
    assert.equal(
      joinUrl(prod, 'ABCD', 'https://perty.onrender.com'),
      'https://perty.onrender.com/j?c=ABCD',
    );
  });

  it('mantiene el puerto cuando la tele entró por IP de LAN', () => {
    assert.equal(joinUrl(prod, 'ABCD', 'http://192.168.1.36:3000'), 'http://192.168.1.36:3000/j?c=ABCD');
  });

  it('descarta localhost: un celular no puede abrir ese QR', () => {
    const url = joinUrl(prod, 'ABCD', 'http://localhost:3000');
    assert.ok(!url.includes('localhost'), `el QR quedó con localhost: ${url}`);
    assert.ok(url.endsWith('/j?c=ABCD'));
  });

  it('también descarta 127.0.0.1', () => {
    assert.ok(!joinUrl(prod, 'ABCD', 'http://127.0.0.1:3000').includes('127.0.0.1'));
  });

  it('sobrevive a un origen roto', () => {
    assert.ok(joinUrl(prod, 'ABCD', 'no es una url').endsWith('/j?c=ABCD'));
    assert.ok(joinUrl(prod, 'ABCD', null).endsWith('/j?c=ABCD'));
  });

  it('en desarrollo apunta al Vite del control, no a este server', () => {
    const dev = { ...prod, isProd: false };
    const url = joinUrl(dev, 'ABCD', 'http://192.168.1.36:5173');
    assert.ok(url.includes(':5174'), `debería apuntar al puerto del control: ${url}`);
    assert.ok(url.endsWith('/?c=ABCD'));
  });
});
