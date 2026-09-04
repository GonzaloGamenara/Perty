# Perty · diseño y hoja de ruta

Este documento explica **por qué** las piezas están donde están, y cómo agregar
cosas sin romper nada. La idea rectora: que sumar caos sea barato.

---

## 1. El contrato

### GameModule

Un juego es esto y nada más:

```ts
interface GameModule<S, C> {
  info: GameInfo;
  defaultConfig(playerCount: number): C;
  create(ctx, config): { state: S; effects?: Effect[] };
  reduce(state: S, event: GameEvent, ctx): { state: S; effects?: Effect[] };
  hostView(state, ctx): unknown;              // lo que ve la tele
  playerView(state, playerId, ctx): PlayerView; // lo que ve cada celular
  playerHud?(state, playerId, ctx): PlayerHud | null;
}
```

`reduce` es **pura**: mismo estado + mismo evento = mismo resultado. No hace
`setTimeout`, no emite sockets, no lee el reloj del sistema (usa `ctx.now`). Todo
lo que quiera que pase en el mundo real lo pide como efecto:

```ts
{ t: 'timer', key: 'phase', delayMs: 5000 }  // avisame en 5s
{ t: 'sfx', name: 'star' }                    // sonido en la tele
{ t: 'finish', standings, medals }            // se terminó
```

El `GameRuntime` (en `packages/engine`) es el que tiene los timers reales, el RNG
sembrado y el reloj. Esa separación es la que hace que un test de una partida
entera corra en 17ms sin esperar un solo segundo real.

### Vistas del celular

`PlayerView` es una unión de primitivas de UI, no de juegos:

| primitiva | para qué |
|---|---|
| `idle` | pantalla de espera con título y emoji |
| `choices` | 4 opciones con color+forma fijos (funciona "a ciegas") |
| `wager` | apostar antes de ver la pregunta |
| `verdict` | acertaste / erraste + monedas |
| `buzzer` | el primero que aprieta |
| `tapper` | machacar el botón |
| `text` | escribir algo (con `numeric` abre el teclado de números) |

**La regla:** si una mecánica nueva necesita una pantalla que no está en esta
lista, agregá la primitiva antes que un componente a medida. Eso mantiene la app
del celular chica y hace que la próxima mecánica salga gratis.

Los 4 slots de respuesta tienen color y forma fijos (`CHOICE_SLOTS`): rojo
triángulo, azul rombo, amarillo círculo, verde cuadrado. Por eso el modificador
"A Ciegas" funciona — el celu muestra solo la forma y el texto queda en la tele.

---

## 2. Cómo agregar cosas

### Un modificador caótico (~15 líneas)

En `packages/games/src/trivia/modifiers.ts`. Se enganchan en tres puntos:

```ts
{
  id: 'espejo',
  name: 'Espejo',
  description: 'Cobrás lo que cobra el que va último.',
  emoji: '🪞', color: '#94a3b8', weight: 5,
  settleAll: (outcomes, state) => { /* … */ },
}
```

- `roll(rng, players)` — datos propios de la ronda (a quién le toca la bala, por
  ejemplo). Queda en `state.modifierData` y lo leen los demás hooks.
- `transformText(text)` — cómo se lee la pregunta (así funciona "Sin Vocales")
- `judge(picked, correct)` — qué cuenta como acierto (así funciona "Al Revés")
- `scoreOne(base, outcome, state)` — cuánto cobra cada uno
- `settleAll(outcomes, state)` — retoque global con todos los resultados a la vista
- `playerHint(playerId, state)` — aviso extra en el celu de uno solo
- `spotlight(state)` — a quién apunta la cámara de la tele
- `blind`, `wagerOptions`, `sabotage`, `timeScale`, `minPlayers` — flags que
  cambian la fase o limitan cuándo puede salir

Para probar uno puntual sin esperar a que salga por azar, poné
`forcedModifier: 'ruleta'` en la config de la trivia.

No hace falta tocar el reducer ni la UI: la tele ya sabe anunciar cualquier
modificador y el celular ya sabe pintar las variantes.

### Una categoría

`categories.ts` + preguntas nuevas. Cada categoría trae su estrella automáticamente.

### Preguntas y consignas

Los dos bancos (`trivia/questions.ts` y `liar/prompts.ts`) se editan a mano, así
que hay un test que los cuida: `test/bank.test.ts` revisa ids repetidos, opciones
duplicadas dentro de una pregunta, enunciados repetidos, categorías inexistentes,
mínimo de preguntas por categoría y reparto de dificultades. En Mentiroso además
chequea que toda consigna tenga su hueco `____` y que la respuesta sea lo bastante
corta como para votarla.

Ese test ya pagó su costo: encontró dos consignas con la respuesta demasiado
larga y dos variantes que, al normalizarlas, eran idénticas a la respuesta.

### Un ataque del jefe (~40 líneas)

En `packages/games/src/boss/mechanics.ts`. Un ataque es un estado propio dentro
de `MechanicState` más cinco funciones: `setupMechanic`, `mechanicAction`,
`mechanicSettled`, `resolveMechanic` y las dos vistas. Los tres que hay se
expresan con primitivas que el celular ya tiene, así que no tocan `apps/controller`.

Al declararlo en `MECHANICS` va con `minPlayers`/`maxPlayers`: si la mesa no da,
el jefe elige otro ataque en vez de romperse.

### Un jefe nuevo (~30 líneas)

Un objeto en `packages/games/src/boss/bosses.ts`: vida por jugador, cuánto carga
su ataque, sus categorías favoritas, sus ataques y sus frases. Las frases son la
mitad del laburo — es lo que hace que la mesa le agarre bronca.

### Una perilla en el lobby

Los juegos declaran sus opciones en `info.settings` y las traducen a config en
`configure()`. La tele dibuja las perillas sola a partir de esa declaración:
sumar una opción no toca la UI.

```ts
settings: [
  { kind: 'choice', id: 'rondas', label: 'Rondas',
    options: [{ value: 8, label: '8 · corta' }, { value: 12, label: '12 · normal' }],
    default: 12 },
  { kind: 'toggles', id: 'categorias', label: 'Categorías',
    options: CATEGORIES.map((c) => ({ value: c.id, label: c.name, emoji: c.emoji })),
    default: CATEGORIES.map((c) => c.id), min: 2 },
],

configure(settings) {
  return { ...defaultTriviaConfig(), rounds: readChoice(settings, 'rondas', [8, 12], 12) };
}
```

**`configure` es un borde de seguridad, no una conveniencia.** Lo que llega
viene de un cliente: `readChoice` y `readToggles` (en `src/settings.ts`) validan
contra la lista declarada y, ante cualquier cosa rara, usan el default. Si alguien
manda `rondas: 999999` la partida sigue durando 12.

### Un juego nuevo

1. Implementá `GameModule` en `packages/games/src/<tujuego>/`.
2. Registralo en `packages/games/src/index.ts` (una línea).
3. Declará sus perillas en `info.settings` y su `configure()`.
4. Si su `hostView` tiene pantallas nuevas, agregá el componente en `apps/host`.
   El celular y el lobby normalmente no se tocan.

---

## 3. Trivia Caótica · reglas actuales

**Ronda:** intro de categoría → (anuncio de modificador) → (apuesta) → pregunta →
revelación → (estrella) → cada 4 rondas, tabla.

**Monedas por acertar:**

```
100 base
+ hasta 120 por velocidad (se derrite con el tiempo)
+ 25 por cada acierto consecutivo previo (tope 4)
+ 40 por nivel de dificultad arriba de 1
+ 50 si fuiste el primero
```

**Estrellas.** Hay una por categoría (8 en total, valen 300 monedas al final).

- Llegás a **2 aciertos** en una categoría → reclamás su estrella si está libre.
- Si la tiene otro, **se la robás**… salvo que el dueño también haya acertado y
  más rápido que vos: ahí **defiende** y te cobra 100 de peaje.

Esto es lo que mantiene el pique sin partir la mesa en un 1v1: la disputa se
resuelve con la misma pregunta que están contestando todos.

**Modificadores implementados (12):** Doble o Nada, A Ciegas, La Apuesta, Al Revés,
Reflejos, Francotirador, Atraco, Dato Fino, Ruleta Rusa, Cadena, Sin Vocales y
Sabotaje.

Dos merecen aclaración porque tienen fase propia:

- **La Apuesta** abre una fase de apuesta antes de mostrar la pregunta.
- **Sabotaje** abre una fase donde cada uno le tacha una opción al siguiente, sin
  haber visto la pregunta todavía. La opción tachada no le llega a la víctima, y
  el server la rechaza aunque el celular la mande igual. Si la víctima falla, el
  saboteador cobra 150.

**Medallas finales:** Bala, Tortuga, En Llamas, Cerebrito, Gatillo Fácil,
Ludópata, Estatua, Mufa, Coleccionista.

---

## 4. Jefe Final · reglas actuales

Modo cooperativo. Todos contra un jefe, **tres vidas compartidas**.

**Ronda:** pregunta → revelación con el daño de la ronda → si la barra de ataque
se llenó, aviso → ataque → resultado.

**Daño.** Cada acierto pega `100 + hasta 120 por velocidad + 40 por dificultad`.
El total de la ronda se multiplica por el **combo del grupo**: si acierta al menos
la mitad de la mesa, el combo sube; cualquier ronda floja lo resetea. Hasta ×2.

**Carga.** El jefe carga su ataque con cada ronda que pasa y, sobre todo, con
cada respuesta fallada. Cuando se llena, ataca y la carga vuelve a cero.

**Ataques** (no son trivia; son las partes donde hay que hablar):

- **Barrido** — machacar el botón entre todos hasta un total. 7 segundos.
- **Escudo Elemental** — cada celular ve solo 2 de las runas y hay que elegir una
  cada uno **sin repetir**. Las manos se arman en cadena: siempre hay solución,
  pero si nadie habla se pisan. 2 a 4 jugadores.
- **La Marca** — el jefe marca a uno: ese ve la pregunta en su celu y **no puede
  contestar**. Los demás ven solo colores, y la tele tampoco muestra nada. El
  marcado tiene que dictar a los gritos. Se salva si acierta la mitad.

Fallar un ataque cuesta un corazón. Sin corazones, o pasadas 14 rondas, gana el
jefe.

**Jefes:** El Compilador (programación y videojuegos), Spoilerus (series, cine,
anime) y Vermil (fantasía y cultura general). Cada uno con sus stats y sus
cargadas.

**Medallas:** Espada del Grupo, Escudo Humano, Machaca, Reflejos, Turista.

---

## 5. Mentiroso · reglas actuales

Sub-género distinto, mismo motor. **Ronda:** consigna → todos escriben una
mentira → todos votan cuál es la verdad → revelación.

- **+500** por cada persona que vota tu mentira.
- **+1000** por encontrar la verdad.
- **+500** si escribiste la verdad sin querer (tu respuesta queda fuera de la
  votación y el celu te avisa).
- Nadie ve ni puede votar su propia mentira, y las mentiras iguales se juntan en
  una sola opción con varios autores: los dos cobran por cada incauto.

**Medallas:** Mentiroso Serial, Sabueso, Ovejita, Suertudo, Fantasma.

Este juego usa las primitivas `text` y `choices` sin agregar nada nuevo al
celular; es el que muestra mejor para qué sirve tener primitivas y no pantallas
a medida.

---

## 6. El Precio Justo · reglas actuales

Una pregunta numérica por ronda. Todos mandan un número y se revelan **juntos**
sobre una recta: nadie ve el número de nadie hasta el final, así no se copian.

- Puntos por puesto: **1000 / 600 / 300 / 150**, y 100 de consuelo del quinto en adelante.
- **+1000 extra** por clavar el número exacto.
- Empatar la distancia empata el puesto y los puntos.
- **Regla de la casa "Sin pasarse"** (opcional): pasarse del número real te deja
  en cero, como en el programa. Cambia por completo cómo se juega — con la regla
  puesta conviene quedarse corto.

**Medallas:** Ojo de Águila, Clavado, Buen Ojímetro, Exagerado, Cauteloso, Fantasma.

Las preguntas tienen que ser **números estables**: nada de "cuántos episodios
lleva One Piece", que cambia y pudre la pregunta sola. Años, duraciones y cuentas
cerradas.

---

## 7. La Noche · reglas actuales

No es un juego: es una secuencia de juegos, y por eso **no implementa
`GameModule`**. La orquesta la sala, que es la única que puede arrancar y
terminar juegos. Vive en `packages/engine/src/night.ts` y no sabe qué juegos
existen: recibe ids y resultados, y decide qué sigue.

**Ronda:** tablero → juego → tablero con los pasos ganados → evento → juego…
hasta el último, y final.

- Cada juego reparte **4/3/2/1 pasos** por puesto. Todos suman algo: nadie se
  queda clavado mirando cómo gana otro.
- Entre juego y juego cae un **evento**: peaje al que va primero, viento de cola
  para el último, cambio de lugar entre el primero y el último, todo o nada
  (el próximo juego vale doble), atajo para los del medio.
- El **último juego vale doble**, así la noche se puede dar vuelta al final.

**El tablero es un dibujo, no una mecánica.** En Mario Party mover fichas se
lleva más de la mitad del tiempo y es la parte que la gente saltea. Acá las
fichas avanzan solas según cómo salió cada uno: se ve el recorrido, pero no se
pierde un segundo en él.

Cada juego declara su **versión corta** con `quickConfig()`: cuatro partidas
completas seguidas eran interminables. El jefe además escala su vida con
`hpScale`, porque con menos rondas y la misma vida era imposible de matar.

---

## 8. Hoja de ruta

### Mecánicas para sumar (ordenadas por relación diversión/esfuerzo)

**Modificadores nuevos** (baratos, solo tocan `modifiers.ts`):

- **Subasta** — se subasta el derecho a contestar solo. Acierta y cobra todo; erra y paga.
- **Cámara lenta** — las opciones aparecen de a una cada 2s; cuanto antes contestás, más pagás.
- **Espejo** — cobrás lo mismo que el que va último.
- **Traducción libre** — la pregunta llega traducida ida y vuelta por un traductor malo.

**Sub-géneros** (necesitan una primitiva nueva en el celular, pero después sirven para todo):

- **Ordená** — poner 4 cosas en orden (años, tamaños, calidad). Primitiva `order` (drag).
- **Duelo relámpago** — pregunta abierta, el primero que aprieta el `buzzer` responde en voz alta y el host valida desde la tele. Cero código de validación.
- **Máquina** — `tapper` para cargar un ataque o una carrera.

**Estrellas, extensiones:**

- **Estrella maldita** — una categoría al azar da estrella negativa: te la sacás de encima acertando en otra.
- **Corona** — juntar 3 estrellas las fusiona en una que vale doble, pero se pierde entera si te roban cualquiera de las tres.

**Modos:**

- Equipos 2v2 (mismo reducer, agrupar puntajes).
- Tablero tipo Mario Party donde las monedas compran movimientos.
- **Puente entre los dos modos:** que las monedas del todos-contra-todos se
  gasten en pociones y revivir contra el jefe.
- **Jefe con fases:** que a partir del 50% de vida cambie de ataques y de
  categorías favoritas.

### Para Mentiroso

- **Consignas sobre el grupo** ("lo más probable que haga ____ un sábado"), que
  es donde el juego se pone realmente personal.
- **Ronda final que vale doble**, para que no se defina en la ronda 3.
- Que las mentiras de rondas anteriores puedan volver como opción fantasma.

---

## 9. Cosas que ya están resueltas y conviene no romper

- **Reconexión.** El celular guarda su sesión: si se bloquea la pantalla o se
  recarga la página, vuelve a la partida con sus monedas. La tele también se
  puede refrescar sin perder la sala.
- **Wake lock.** El celular no se bloquea mientras jugás.
- **Reloj.** Cada frame trae `serverNow`; los clientes calculan su offset, así los
  contadores no dependen de que el celular tenga la hora bien.
- **Entrar tarde.** Se puede entrar con la partida empezada (arrancás en 0).
- **Toma de control.** Si abrís el control en otro dispositivo, la pantalla vieja
  se entera en vez de quedar congelada.
- **Sonido sin archivos.** La tele sintetiza los blips con WebAudio: no hay assets
  que descargar ni que versionar.
