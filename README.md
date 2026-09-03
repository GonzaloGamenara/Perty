# 🎉 Perty

Central de juegos para jugar en la tele con el celular como control.
La tele muestra el tablero, cada uno entra desde su celu escaneando un QR.

Cuatro juegos por ahora:

- **Trivia Caótica** — todos contra todos. Monedas, estrellas por categoría que
  se roban entre ustedes, y doce modificadores que rompen las reglas cada par de rondas.
- **Jefe Final** — cooperativo. Le pegan al jefe con trivia, y cada tanto el jefe
  ataca con algo que no es trivia y hay que hablar para sobrevivir. Tres vidas
  compartidas: el error de uno es problema de todos.
- **Mentiroso** — cada uno inventa una respuesta falsa; después todos votan cuál
  es la verdadera. Cobrás por cada uno que pica en tu mentira y por encontrar la
  verdad entre las de los demás.
- **El Precio Justo** — una pregunta numérica, todos tiran un número y se revelan
  juntos en una recta. Gana el que menos se aleja, con bonus para el que la clava.

---

## Arrancar

```bash
npm install
```

**Para jugar de verdad** (un solo puerto, la tele y los celulares en la misma red):

```bash
npm run build && npm start
```

La consola imprime las dos URLs. Abrí la de la tele en el navegador del Smart TV
(o en una notebook conectada por HDMI) y listo: el QR de la pantalla lleva a los
celulares directo a la sala.

**Para desarrollar** (hot reload en las tres piezas):

```bash
npm run dev
```

| | dev | producción |
|---|---|---|
| Tele | http://localhost:5173 | http://\<tu-ip\>:3000 |
| Celular | http://\<tu-ip\>:5174 | http://\<tu-ip\>:3000/j |
| Server | :3000 | :3000 |

> Los celulares tienen que estar en el mismo WiFi que la máquina que corre el
> server. Si querés jugar con alguien que no está en la casa, poné el server
> detrás de un túnel o deployalo y seteá `PERTY_PUBLIC_URL`.

## Probar sin juntar a nadie

Bots que se conectan como jugadores comunes y contestan solos:

```bash
npm run bots -- ABCD 3
```

(`ABCD` es el código que muestra la tele.) Sirven para ver una mecánica nueva
funcionando sin esperar al fin de semana.

## Otros comandos

```bash
npm test        # tests del motor de trivia (rápidos, sin red)
npm run typecheck
```

En la tele, la **barra espaciadora** adelanta la fase actual: sirve para saltear
una pregunta que nadie sabe.

## Configurar la partida

Al elegir un juego en el lobby aparecen sus perillas antes de arrancar: cuántas
rondas, cuánto tiempo por pregunta, cuánto caos, qué categorías entran, contra
qué jefe pelean y con cuántas vidas. No hace falta tocar código para cambiar el
ritmo de una noche.

---

## Cómo está armado

```
packages/
  protocol/   tipos compartidos: el contrato entre server, tele y celular
  engine/     salas, jugadores, timers y el contrato GameModule (no sabe de juegos)
  games/      trivia + jefe final + mentiroso + el precio justo + los bancos
apps/
  server/     socket.io, salas en memoria, sirve las dos apps en producción
  host/       la tele (React + Vite)
  controller/ el celular (React + Vite)
```

Tres decisiones que conviene conocer antes de tocar algo:

1. **El server es autoritativo.** El celular manda intención (`elegí la opción B`)
   y recibe una vista ya resuelta. Los tiempos de respuesta los mide el server,
   así que no se puede hacer trampa con el reloj del celular.
2. **Los juegos son máquinas de estados puras.** `reduce(state, evento) → {state, effects}`.
   No tocan sockets ni `Date.now()`. Eso los hace testeables y determinísticos.
3. **El celular renderiza primitivas, no juegos.** `choices`, `wager`, `buzzer`,
   `tapper`, `text`, `verdict`… Una mecánica nueva casi nunca necesita tocar la
   app del celular.

Los detalles de cómo sumar juegos, mecánicas y preguntas están en
[DESIGN.md](DESIGN.md).

## Sumar preguntas

El banco arranca con **281 preguntas** repartidas en 8 categorías (35 por tema),
**80 consignas** para Mentiroso y **44 preguntas numéricas** para El Precio Justo. Una partida de trivia usa 12 preguntas y una de
jefe hasta 15, así que da para varias noches sin repetir.

Para la trivia y el jefe, editá
[`packages/games/src/trivia/questions.ts`](packages/games/src/trivia/questions.ts).
La opción correcta va **siempre primera** — el juego baraja las opciones solo.

```ts
{ id: 'vj15', category: 'videojuegos', difficulty: 2,
  text: '¿Cómo se llama el caballo de Geralt?',
  options: ['Sardinilla', 'Epona', 'Agro', 'Rocinante'] },
```

TypeScript se queja si falta una opción o la categoría no existe, y
`npm test` además revisa que no haya ids repetidos, opciones duplicadas,
enunciados repetidos ni categorías flacas.

Para Mentiroso, las consignas están en
[`packages/games/src/liar/prompts.ts`](packages/games/src/liar/prompts.ts). Llevan
`____` donde va la respuesta, y la respuesta tiene que ser corta:

```ts
{ id: 'lvj6', category: 'videojuegos',
  text: 'El primer nombre de la consola PlayStation fue ____',
  answer: 'Nintendo PlayStation' },
```
