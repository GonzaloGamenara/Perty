# 🎉 Perty

Central de juegos para jugar en la tele con el celular como control.
La tele muestra el tablero, cada uno entra desde su celu escaneando un QR.

Cuatro juegos, y un modo que los encadena:

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
- **La Noche** — varios juegos seguidos con un solo campeón. Cada uno reparte
  pasos según el puesto, entre juego y juego cae un evento que castiga al que va
  ganando, y el último vale doble.

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

## Publicarlo en internet

**En Vercel no funciona.** No es un problema de configuración: Vercel corre
funciones serverless, que arrancan, responden y mueren. Perty necesita lo
contrario en tres puntos a la vez:

- **WebSockets abiertos.** Los celulares mantienen la conexión toda la partida.
- **Estado en memoria.** Las salas viven en un `Map` dentro del proceso. Si cada
  request cae en una instancia distinta, la sala no existe.
- **Timers propios.** El juego avanza solo, con `setTimeout` adentro del proceso.
  Una función que ya devolvió no puede hacer avanzar una ronda.

Lo mismo aplica a Netlify o Cloudflare Workers. Hace falta una plataforma que
corra **un proceso Node que no se apague**: Render, Railway, Fly.io o un VPS.

### El camino más corto: Render

Hay un `render.yaml` en la raíz, así que no hay que completar campos:

1. Creá tu cuenta en [render.com](https://render.com) (podés entrar con GitHub).
2. **New → Blueprint** y elegí este repo.
3. Apply. Tarda unos minutos la primera vez.

Te queda una URL fija tipo `https://perty.onrender.com`. Esa es la que abrís en
la tele, siempre. El QR se arma solo con ese dominio: no hay nada que configurar.

En el plan gratis el servicio se duerme a los 15 minutos sin uso; el primero que
abre la URL lo despierta en unos 30 segundos.

### Una sola instancia, siempre

Las salas viven en la memoria de un proceso. Con dos instancias, la tele puede
quedar en una y los celulares en la otra, y no se ven entre sí. Mientras no haya
un almacenamiento compartido, **no escalar horizontalmente**.

Tampoco sobreviven a un reinicio: si el server se cae o la plataforma lo duerme
por inactividad, las salas abiertas se pierden. Para juntadas donde se arranca
de cero cada noche no molesta; hay que saberlo igual.

### En qué pantalla se muestra

La vista de la tele se dibuja siempre a **1280x720** y se escala para entrar en
la pantalla que sea. Eso vuelve intercambiables estas tres opciones:

| Cómo | Quién dibuja |
|---|---|
| Abrir la URL en el navegador de la smart TV | La tele |
| Espejar un celular o tablet (AirPlay, Chromecast) | El celular |
| Notebook por HDMI, o castear la pestaña | La notebook |

Las últimas dos **esquivan el navegador de la tele**, que es la parte más
impredecible del sistema. Si espejás, ese dispositivo queda ocupado haciendo de
tele y no puede jugar: usá uno que sobre, o el de quien prefiera mirar.

> El servidor no puede vivir en un iPhone: iOS no deja correr procesos de fondo.
> Eso va en internet o en una notebook, y es independiente de dónde se muestre.

### Antes de la junta: probá la tele

Abrí **`/check`** en el navegador de la tele (por ejemplo
`https://tu-app.onrender.com/check`). Es una página en HTML y JS planos, sin
build, que carga en cualquier navegador y dice en 30 segundos si esa pantalla
puede correr el juego.

El navegador de una smart TV va clavado al año del modelo y no se actualiza de
verdad. El piso de Perty es **Chrome 99** (por las capas de CSS), lo que en
Samsung/Tizen significa modelos de **2023 en adelante**. Si `/check` da que no,
cualquiera de las otras dos filas de la tabla de arriba lo resuelve.

### Lo que se gana al publicarlo

Además de poder jugar sin estar en la misma casa, se gana **HTTPS**, y con eso
el bloqueo de pantalla del celular: la Wake Lock API solo existe en contextos
seguros, así que en la LAN por HTTP hoy no funciona (falla en silencio, el juego
sigue andando). Publicado, funciona.

### Otras plataformas

Hay un `Dockerfile` en la raíz para Fly.io, Railway o un VPS. Sirve también para
correrlo en casa siempre prendido, en una Raspberry o un NAS.

> `PERTY_PUBLIC_URL` existe como escape: solo hace falta si el dominio público
> no es por el que entra la tele (por ejemplo detrás de un proxy raro).

---

## Probar sin juntar a nadie

En el lobby hay un botón **🤖 Agregar bot**: cada clic suma un jugador que el
server maneja solo. Contestan con demoras y aciertos variados, así que sirven
para ver un juego entero funcionando, o para completar la mesa si falta uno.

También están por línea de comandos, que además prueban la red de verdad porque
se conectan por socket como un celular:

```bash
npm run bots -- ABCD 3
```

(`ABCD` es el código que muestra la tele.) Los dos caminos comparten el mismo
cerebro: `apps/server/src/bot-brain.ts`.

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

**La tele no se toca.** A una smart TV no se le puede hacer clic, así que el
lobby vive en el celular del que abre la sala: ahí se elige el juego, se ajustan
las perillas, se agregan bots y se arranca. La tele muestra el QR, quién está y
qué se está armando. Lo único que se aprieta en la tele es el botón de crear la
sala, que además es el gesto que habilita el sonido.

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
