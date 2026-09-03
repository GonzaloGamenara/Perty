import type { LiarPrompt } from './types';

/**
 * Consignas para Mentiroso. La gracia es que la respuesta real sea rara pero
 * cierta: tiene que dar ganas de inventar algo más creíble que la verdad.
 *
 * Reglas para sumar consignas:
 *  - `text` lleva `____` donde va la respuesta.
 *  - `answer` va corto (2-4 palabras). Si es largo, nadie lo va a votar.
 *  - `also` son variantes que cuentan como "escribiste la verdad sin querer".
 */
export const LIAR_PROMPTS: LiarPrompt[] = [
  // -- videojuegos ----------------------------------------------------------
  { id: 'lvj1', category: 'videojuegos', text: 'Nintendo se fundó en 1889 fabricando ____', answer: 'naipes', also: ['cartas', 'barajas'] },
  { id: 'lvj2', category: 'videojuegos', text: 'Antes de llamarse Mario, el personaje se llamaba ____', answer: 'Jumpman' },
  { id: 'lvj3', category: 'videojuegos', text: 'Pac-Man se llamaba originalmente ____', answer: 'Puck Man' },
  { id: 'lvj4', category: 'videojuegos', text: 'El nombre en clave de la Nintendo Wii mientras la desarrollaban era ____', answer: 'Revolution' },
  { id: 'lvj5', category: 'videojuegos', text: 'El primer videojuego que llegó al espacio fue ____', answer: 'Tetris' },

  { id: 'lvj6', category: 'videojuegos', text: 'Alexey Pajitnov no cobró un peso por Tetris durante años porque los derechos eran de ____', answer: 'la Unión Soviética', also: ['la URSS'] },
  { id: 'lvj7', category: 'videojuegos', text: 'Para los gruñidos de los monstruos del Doom original grabaron ____', answer: 'animales de zoológico' },
  { id: 'lvj8', category: 'videojuegos', text: 'El primer easter egg de la historia lo escondió un programador de Atari porque la empresa no ponía ____', answer: 'los nombres de los creadores' },
  { id: 'lvj9', category: 'videojuegos', text: 'Los Sims iba a llamarse ____', answer: 'Dollhouse', also: ['casa de muñecas'] },
  { id: 'lvj10', category: 'videojuegos', text: 'En Space Invaders los aliens aceleran a medida que los matás por ____', answer: 'una limitación del hardware' },

  // -- programación ---------------------------------------------------------
  { id: 'lpr1', category: 'programacion', text: 'El primer "bug" documentado de la historia era literalmente ____', answer: 'una polilla', also: ['una mariposa nocturna'] },
  { id: 'lpr2', category: 'programacion', text: 'Antes de llamarse Google, el buscador se llamaba ____', answer: 'BackRub' },
  { id: 'lpr3', category: 'programacion', text: 'Cuando lo crearon, JavaScript se llamaba ____', answer: 'Mocha' },
  { id: 'lpr4', category: 'programacion', text: 'El lenguaje Python se llama así por ____', answer: 'Monty Python' },
  { id: 'lpr5', category: 'programacion', text: 'Linus Torvalds quería que su sistema se llamara ____', answer: 'Freax' },
  { id: 'lpr6', category: 'programacion', text: 'Amazon arrancó vendiendo únicamente ____', answer: 'libros' },
  { id: 'lpr7', category: 'programacion', text: 'La mascota de GitHub se llama ____', answer: 'Octocat' },

  { id: 'lpr8', category: 'programacion', text: 'Ray Tomlinson eligió la arroba para los correos porque ____', answer: 'no aparecía en ningún nombre' },
  { id: 'lpr9', category: 'programacion', text: 'La primera computadora de Apple se vendía a ____', answer: '666,66 dólares', also: ['666 dolares'] },
  { id: 'lpr10', category: 'programacion', text: 'El lenguaje Java se llama así por ____', answer: 'el café' },
  { id: 'lpr11', category: 'programacion', text: 'La palabra "WiFi" no significa nada: la inventó ____', answer: 'una agencia de marketing' },
  { id: 'lpr12', category: 'programacion', text: 'El primer dominio de internet registrado de la historia fue ____', answer: 'symbolics.com', also: ['symbolics'] },

  // -- cine -----------------------------------------------------------------
  { id: 'lci1', category: 'cine', text: 'El tiburón mecánico de "Tiburón" se llamaba ____', answer: 'Bruce' },
  { id: 'lci2', category: 'cine', text: 'El rugido de Chewbacca se armó a partir de sonidos de ____', answer: 'un oso' },
  { id: 'lci3', category: 'cine', text: 'Antes que a Keanu Reeves, el papel de Neo se le ofreció a ____', answer: 'Will Smith' },
  { id: 'lci4', category: 'cine', text: 'En Volver al Futuro, la máquina del tiempo originalmente iba a ser ____', answer: 'una heladera', also: ['un refrigerador'] },
  { id: 'lci5', category: 'cine', text: 'El eslogan de Alien era "En el espacio nadie puede ____"', answer: 'oírte gritar' },

  { id: 'lci6', category: 'cine', text: 'Filmando El Señor de los Anillos, Viggo Mortensen se rompió ____ pateando un casco', answer: 'dos dedos del pie', also: ['los dedos del pie'] },
  { id: 'lci7', category: 'cine', text: 'En la escena de la ducha de Psicosis, la sangre en realidad era ____', answer: 'jarabe de chocolate', also: ['sirope de chocolate'] },
  { id: 'lci8', category: 'cine', text: 'La respiración de Darth Vader se grabó con ____', answer: 'un regulador de buceo' },
  { id: 'lci9', category: 'cine', text: 'Filmar Titanic salió más caro que ____', answer: 'construir el Titanic real', also: ['el titanic real'] },
  { id: 'lci10', category: 'cine', text: 'En Tiburón casi no se ve al tiburón porque ____', answer: 'el tiburón mecánico no funcionaba' },

  // -- series ---------------------------------------------------------------
  { id: 'lse1', category: 'series', text: 'El perro de Los Simpson se llama ____', answer: 'Ayudante de Santa' },
  { id: 'lse2', category: 'series', text: 'El café donde paran los de Friends se llama ____', answer: 'Central Perk' },
  { id: 'lse3', category: 'series', text: 'El jefe insoportable de la versión británica de The Office lo interpretó ____', answer: 'Ricky Gervais' },
  { id: 'lse4', category: 'series', text: 'Eligieron "Springfield" para Los Simpson porque es el nombre de ciudad más común de ____', answer: 'Estados Unidos', also: ['EE.UU.', 'USA'] },

  { id: 'lse5', category: 'series', text: 'El segundo nombre de Homero Simpson es ____', answer: 'Jay' },
  { id: 'lse6', category: 'series', text: 'El café de Friends nunca existió: era ____', answer: 'un decorado en un estudio' },
  { id: 'lse7', category: 'series', text: 'Antes de Breaking Bad, a Bryan Cranston lo conocían por hacer de ____', answer: 'el papá de Malcolm' },
  { id: 'lse8', category: 'series', text: 'En una escena de Game of Thrones se coló en pantalla ____', answer: 'un vaso de café' },
  { id: 'lse9', category: 'series', text: 'Black Mirror se llama así por ____', answer: 'la pantalla apagada de un dispositivo', also: ['la pantalla apagada'] },

  // -- anime ----------------------------------------------------------------
  { id: 'lan1', category: 'anime', text: '"Pokémon" es la abreviatura de ____', answer: 'Pocket Monsters' },
  { id: 'lan2', category: 'anime', text: 'Pikachu iba a tener una tercera evolución llamada ____', answer: 'Gorochu' },
  { id: 'lan3', category: 'anime', text: 'Dragon Ball está inspirado en la novela china ____', answer: 'Viaje al Oeste' },
  { id: 'lan4', category: 'anime', text: 'La palabra "ghibli" significa ____', answer: 'viento caliente del desierto' },

  { id: 'lan5', category: 'anime', text: 'Goku está inspirado en ____, el rey mono de una novela china', answer: 'Sun Wukong' },
  { id: 'lan6', category: 'anime', text: 'La primera serie de anime que salió en la televisión japonesa fue ____', answer: 'Astro Boy' },
  { id: 'lan7', category: 'anime', text: 'Los ojos enormes del estilo anime los popularizó ____', answer: 'Osamu Tezuka' },
  { id: 'lan8', category: 'anime', text: 'El nombre "Pikachu" junta la palabra "pika" (chispa) con ____', answer: 'el chillido de un ratón', also: ['chu'] },
  { id: 'lan9', category: 'anime', text: 'One Piece se publica sin parar desde ____', answer: '1997' },

  // -- fantasía y libros ----------------------------------------------------
  { id: 'lfa1', category: 'fantasia', text: 'Tolkien trabajó en el diccionario Oxford escribiendo palabras que empiezan con ____', answer: 'W' },
  { id: 'lfa2', category: 'fantasia', text: 'Tolkien escribió la primera frase de El Hobbit en ____', answer: 'un examen que estaba corrigiendo' },
  { id: 'lfa3', category: 'fantasia', text: 'George R.R. Martin escribe sus libros en un programa de los 80 llamado ____', answer: 'WordStar' },
  { id: 'lfa4', category: 'fantasia', text: 'Los nombres de los enanos de El Hobbit salieron de un poema nórdico llamado ____', answer: 'Völuspá' },

  { id: 'lfa5', category: 'fantasia', text: 'Tolkien inventó primero ____ y después el mundo entero para que existieran', answer: 'los idiomas élficos', also: ['los idiomas', 'las lenguas elficas'] },
  { id: 'lfa6', category: 'fantasia', text: 'A J.K. Rowling se le ocurrió Harry Potter mientras estaba ____', answer: 'demorada en un tren', also: ['en un tren'] },
  { id: 'lfa7', category: 'fantasia', text: 'En nórdico antiguo, "Gandalf" significa ____', answer: 'elfo con vara', also: ['elfo de la vara'] },
  { id: 'lfa8', category: 'fantasia', text: 'Stephen King tiró el manuscrito de Carrie a la basura y lo rescató ____', answer: 'su esposa' },
  { id: 'lfa9', category: 'fantasia', text: 'El primer libro importante impreso con tipos móviles en Europa fue ____', answer: 'la Biblia de Gutenberg', also: ['la biblia'] },

  // -- comida ---------------------------------------------------------------
  { id: 'lco1', category: 'comida', text: 'Originalmente las zanahorias eran de color ____', answer: 'morado', also: ['violeta', 'púrpura'] },
  { id: 'lco2', category: 'comida', text: 'El wasabi que sirven en la mayoría de los restaurantes en realidad es ____', answer: 'rábano picante teñido', also: ['rabano picante'] },
  { id: 'lco3', category: 'comida', text: 'En el siglo XIX, el kétchup se vendía como ____', answer: 'medicina', also: ['remedio'] },
  { id: 'lco4', category: 'comida', text: 'Los croissants no son franceses: son ____', answer: 'austríacos', also: ['de Austria'] },
  { id: 'lco5', category: 'comida', text: 'El chocolate blanco no lleva nada de ____', answer: 'pasta de cacao', also: ['cacao'] },
  { id: 'lco6', category: 'comida', text: 'Si está bien guardada, la miel nunca ____', answer: 'se echa a perder', also: ['caduca', 'se vence'] },

  { id: 'lco7', category: 'comida', text: 'Las papas fritas no son francesas: son de ____', answer: 'Bélgica' },
  { id: 'lco8', category: 'comida', text: 'El sándwich se llama así por ____', answer: 'un conde inglés', also: ['el conde de sandwich'] },
  { id: 'lco9', category: 'comida', text: 'La pizza margarita lleva ese nombre por ____', answer: 'una reina italiana', also: ['la reina margarita'] },
  { id: 'lco10', category: 'comida', text: 'El microondas se inventó cuando a un ingeniero se le derritió ____ en el bolsillo', answer: 'una barra de chocolate', also: ['un chocolate'] },
  { id: 'lco11', category: 'comida', text: 'El tomate llegó a la cocina italiana recién cuando lo trajeron de ____', answer: 'América' },

  // -- cultura general ------------------------------------------------------
  { id: 'lcu1', category: 'cultura', text: 'Los pulpos tienen la sangre de color ____', answer: 'azul' },
  { id: 'lcu2', category: 'cultura', text: 'En verano, la Torre Eiffel crece unos ____', answer: '15 centímetros', also: ['15 cm'] },
  { id: 'lcu3', category: 'cultura', text: 'Las huellas dactilares de los koalas son ____', answer: 'casi idénticas a las humanas' },
  { id: 'lcu4', category: 'cultura', text: 'El grito de Tarzán es ____', answer: 'una marca registrada' },
  { id: 'lcu5', category: 'cultura', text: 'Un rayo es unas cinco veces más caliente que ____', answer: 'la superficie del Sol' },
  { id: 'lcu6', category: 'cultura', text: 'La Gran Muralla China, a simple vista desde el espacio, ____', answer: 'no se ve' },
  { id: 'lcu7', category: 'cultura', text: 'Técnicamente, las bananas son ____', answer: 'bayas' },
  { id: 'lcu8', category: 'cultura', text: 'El corazón de una ballena azul pesa más o menos lo mismo que ____', answer: 'un auto' },
  { id: 'lcu9', category: 'cultura', text: 'Cleopatra vivió más cerca en el tiempo de ____ que de la construcción de las pirámides', answer: 'la llegada del hombre a la Luna', also: ['el hombre en la luna'] },
  { id: 'lcu10', category: 'cultura', text: 'El animal que más muertes humanas causa por año es ____', answer: 'el mosquito' },
];
