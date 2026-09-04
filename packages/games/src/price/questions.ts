import type { PriceQuestion } from './types';

/**
 * Preguntas numéricas para El Precio Justo.
 *
 * Regla al sumar: la respuesta tiene que ser un número **estable**. Nada de
 * "cuántos episodios lleva One Piece" ni "cuántas copias vendió X": eso cambia
 * y la pregunta se pudre sola. Años, duraciones, cuentas cerradas y constantes.
 */
export const PRICE_QUESTIONS: PriceQuestion[] = [
  // -- videojuegos ----------------------------------------------------------
  { id: 'pvj1', category: 'videojuegos', text: '¿En qué año se fundó Nintendo?', answer: 1889, unit: 'año' },
  { id: 'pvj2', category: 'videojuegos', text: '¿En qué año salió DOOM?', answer: 1993, unit: 'año' },
  { id: 'pvj3', category: 'videojuegos', text: '¿Cuántas piezas distintas tiene el Tetris?', answer: 7, unit: 'piezas' },
  { id: 'pvj4', category: 'videojuegos', text: '¿Cuántos jugadores entran en una partida de Fortnite?', answer: 100, unit: 'jugadores' },
  { id: 'pvj5', category: 'videojuegos', text: '¿En qué año salió la primera PlayStation en Japón?', answer: 1994, unit: 'año' },
  { id: 'pvj6', category: 'videojuegos', text: '¿En qué nivel aparece la pantalla rota del Pac-Man original?', answer: 256, unit: 'nivel', note: 'El contador de niveles se desborda a los 256.' },

  // -- programación ---------------------------------------------------------
  { id: 'ppr1', category: 'programacion', text: '¿En qué año publicó Linus Torvalds la primera versión de Linux?', answer: 1991, unit: 'año' },
  { id: 'ppr2', category: 'programacion', text: '¿Cuántos bits tiene una dirección IPv4?', answer: 32, unit: 'bits' },
  { id: 'ppr3', category: 'programacion', text: '¿Cuál es el puerto por defecto de PostgreSQL?', answer: 5432, unit: 'puerto' },
  { id: 'ppr4', category: 'programacion', text: '¿Cuántos caracteres tenía un tweet originalmente?', answer: 140, unit: 'caracteres' },
  { id: 'ppr5', category: 'programacion', text: '¿Cuál es el valor máximo de un byte sin signo?', answer: 255, unit: 'valor' },
  { id: 'ppr6', category: 'programacion', text: '¿Cuántos ceros tiene un googol?', answer: 100, unit: 'ceros' },

  // -- cine -----------------------------------------------------------------
  { id: 'pci1', category: 'cine', text: '¿Cuántos minutos dura El Padrino?', answer: 175, unit: 'minutos' },
  { id: 'pci2', category: 'cine', text: '¿En qué año se estrenó Blade Runner?', answer: 1982, unit: 'año' },
  { id: 'pci3', category: 'cine', text: '¿Cuántos Óscar ganó Titanic?', answer: 11, unit: 'premios' },
  { id: 'pci4', category: 'cine', text: '¿En qué año se estrenó Toy Story?', answer: 1995, unit: 'año' },
  { id: 'pci5', category: 'cine', text: '¿Cuántos minutos dura El Retorno del Rey en su versión de cine?', answer: 201, unit: 'minutos' },
  { id: 'pci6', category: 'cine', text: '¿En qué año se estrenó Matrix?', answer: 1999, unit: 'año' },

  // -- series ---------------------------------------------------------------
  { id: 'pse1', category: 'series', text: '¿Cuántos episodios tiene Breaking Bad?', answer: 62, unit: 'episodios' },
  { id: 'pse2', category: 'series', text: '¿Cuántos episodios tiene Friends?', answer: 236, unit: 'episodios' },
  { id: 'pse3', category: 'series', text: '¿En qué año se estrenó Los Simpson como serie propia?', answer: 1989, unit: 'año' },
  { id: 'pse4', category: 'series', text: '¿Cuántos episodios tiene Game of Thrones?', answer: 73, unit: 'episodios' },
  { id: 'pse5', category: 'series', text: '¿Cuántas temporadas tuvo The Office de Estados Unidos?', answer: 9, unit: 'temporadas' },

  // -- anime ----------------------------------------------------------------
  { id: 'pan1', category: 'anime', text: '¿Cuántos episodios tiene la serie original de Neon Genesis Evangelion?', answer: 26, unit: 'episodios' },
  { id: 'pan2', category: 'anime', text: '¿En qué año se estrenó la película Akira?', answer: 1988, unit: 'año' },
  { id: 'pan3', category: 'anime', text: '¿Cuántos episodios tiene Death Note?', answer: 37, unit: 'episodios' },
  { id: 'pan4', category: 'anime', text: '¿Cuántos episodios tiene Cowboy Bebop?', answer: 26, unit: 'episodios' },
  { id: 'pan5', category: 'anime', text: '¿Cuántos episodios tiene Fullmetal Alchemist: Brotherhood?', answer: 64, unit: 'episodios' },

  // -- fantasía y libros ----------------------------------------------------
  { id: 'pfa1', category: 'fantasia', text: '¿En qué año se publicó El Hobbit?', answer: 1937, unit: 'año' },
  { id: 'pfa2', category: 'fantasia', text: '¿Cuántos Anillos de Poder se forjaron en total, contando el Único?', answer: 20, unit: 'anillos', note: '3 elfos + 7 enanos + 9 hombres + 1.' },
  { id: 'pfa3', category: 'fantasia', text: '¿En qué año se publicó el primer libro de Harry Potter?', answer: 1997, unit: 'año' },
  { id: 'pfa4', category: 'fantasia', text: '¿Cuántos libros publicados tiene Canción de Hielo y Fuego?', answer: 5, unit: 'libros' },
  { id: 'pfa5', category: 'fantasia', text: '¿En qué año se publicó Dune?', answer: 1965, unit: 'año' },

  // -- comida ---------------------------------------------------------------
  { id: 'pco1', category: 'comida', text: '¿En qué año se inventó la Coca-Cola?', answer: 1886, unit: 'año' },
  { id: 'pco2', category: 'comida', text: 'Sin contar la masa, ¿cuántos ingredientes lleva una pizza margarita clásica?', answer: 3, unit: 'ingredientes', note: 'Tomate, mozzarella y albahaca.' },
  { id: 'pco3', category: 'comida', text: '¿A cuántos grados se cocina una pizza napolitana en horno de leña?', answer: 450, unit: '°C' },
  { id: 'pco4', category: 'comida', text: '¿Cuántas calorías tiene más o menos una banana mediana?', answer: 105, unit: 'calorías' },
  { id: 'pco5', category: 'comida', text: '¿Cuántos meses mínimo tiene que madurar un Parmigiano Reggiano?', answer: 12, unit: 'meses' },

  // -- cultura general ------------------------------------------------------
  { id: 'pcu1', category: 'cultura', text: '¿Cuántos elementos tiene la tabla periódica?', answer: 118, unit: 'elementos' },
  { id: 'pcu2', category: 'cultura', text: '¿Cuántos metros mide la Torre Eiffel con antena incluida?', answer: 330, unit: 'metros' },
  { id: 'pcu3', category: 'cultura', text: '¿En qué año se hundió el Titanic?', answer: 1912, unit: 'año' },
  { id: 'pcu4', category: 'cultura', text: '¿Cuántos países miembros tiene la ONU?', answer: 193, unit: 'países' },
  { id: 'pcu5', category: 'cultura', text: '¿A cuántos miles de kilómetros está la Luna en promedio?', answer: 384, unit: 'miles de km' },
  { id: 'pcu6', category: 'cultura', text: '¿Cuántos kilómetros mide el ecuador terrestre?', answer: 40075, unit: 'km' },

  // -- deportes -------------------------------------------------------------
  { id: 'pde1', category: 'deportes', text: '¿En qué año se jugó el primer Mundial de fútbol?', answer: 1930, unit: 'año' },
  { id: 'pde2', category: 'deportes', text: '¿Cuántos metros de largo tiene una pileta olímpica?', answer: 50, unit: 'metros' },
  { id: 'pde3', category: 'deportes', text: 'Contando los dos equipos, ¿cuántos jugadores hay en una cancha de fútbol?', answer: 22, unit: 'jugadores' },
  { id: 'pde4', category: 'deportes', text: '¿En qué año ganó Argentina su primer Mundial?', answer: 1978, unit: 'año' },
  { id: 'pde5', category: 'deportes', text: '¿Cuántos minutos dura un partido de básquet FIBA sin contar prórrogas?', answer: 40, unit: 'minutos' },
  { id: 'pde6', category: 'deportes', text: '¿Cuántos kilómetros recorre el Tour de France, más o menos?', answer: 3500, unit: 'km' },

  // -- música ---------------------------------------------------------------
  { id: 'pmu1', category: 'musica', text: '¿En qué año se separaron los Beatles?', answer: 1970, unit: 'año' },
  { id: 'pmu2', category: 'musica', text: '¿Cuántas teclas negras tiene un piano estándar?', answer: 36, unit: 'teclas' },
  { id: 'pmu3', category: 'musica', text: '¿En qué año murió Freddie Mercury?', answer: 1991, unit: 'año' },
  { id: 'pmu4', category: 'musica', text: '¿En qué año salió "Bohemian Rhapsody"?', answer: 1975, unit: 'año' },
  { id: 'pmu5', category: 'musica', text: '¿En qué año se hizo el festival de Woodstock?', answer: 1969, unit: 'año' },
  { id: 'pmu6', category: 'musica', text: '¿En qué año se formó Soda Stereo?', answer: 1982, unit: 'año' },

  // -- historia -------------------------------------------------------------
  { id: 'phi1', category: 'historia', text: '¿En qué año cayó el Muro de Berlín?', answer: 1989, unit: 'año' },
  { id: 'phi2', category: 'historia', text: '¿En qué año empezó la Revolución Francesa?', answer: 1789, unit: 'año' },
  { id: 'phi3', category: 'historia', text: '¿En qué año fue la Revolución de Mayo?', answer: 1810, unit: 'año' },
  { id: 'phi4', category: 'historia', text: '¿En qué año terminó la Segunda Guerra Mundial?', answer: 1945, unit: 'año' },
  { id: 'phi5', category: 'historia', text: '¿Cuántos años tiene más o menos la Gran Pirámide de Guiza?', answer: 4500, unit: 'años' },
  { id: 'phi6', category: 'historia', text: '¿En qué año pisó el hombre la Luna por primera vez?', answer: 1969, unit: 'año' },

  // -- internet -------------------------------------------------------------
  { id: 'pin1', category: 'internet', text: '¿En qué año se fundó Google?', answer: 1998, unit: 'año' },
  { id: 'pin2', category: 'internet', text: '¿En qué año se creó YouTube?', answer: 2005, unit: 'año' },
  { id: 'pin3', category: 'internet', text: '¿Cuántos caracteres entran hoy en un tweet?', answer: 280, unit: 'caracteres' },
  { id: 'pin4', category: 'internet', text: '¿En qué año se lanzó Wikipedia?', answer: 2001, unit: 'año' },
  { id: 'pin5', category: 'internet', text: '¿En qué año se lanzó WhatsApp?', answer: 2009, unit: 'año' },
  { id: 'pin6', category: 'internet', text: '¿En qué año se envió el primer correo electrónico?', answer: 1971, unit: 'año' },
];
