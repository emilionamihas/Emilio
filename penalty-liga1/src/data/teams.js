// Datos de equipos. Nombres reales de clubes de la Liga 1 peruana (uso informativo,
// sin afiliación oficial). Los escudos NO son los oficiales: se generan por código
// en CrestFactory.js como formas originales con los colores del club e iniciales.
// Jugadores y atributos son ficticios.

export const TEAMS = [
  {
    id: 'universitario',
    name: 'Universitario',
    shortName: 'UNI',
    colors: { primary: 0xb2001f, secondary: 0xffffff },
    stats: { shotPower: 82, shotAccuracy: 78, goalkeeping: 80 },
    players: {
      shooter: { name: 'J. Quispe', role: 'Delantero estrella', power: 88 },
      keeper: { name: 'R. Fernández', role: 'Portero titular', reflexes: 82 }
    }
  },
  {
    id: 'alianza',
    name: 'Alianza Lima',
    shortName: 'ALI',
    colors: { primary: 0x0033a0, secondary: 0xffffff },
    stats: { shotPower: 80, shotAccuracy: 81, goalkeeping: 76 },
    players: {
      shooter: { name: 'K. Barrios', role: 'Extremo letal', power: 85 },
      keeper: { name: 'A. Cáceda', role: 'Portero titular', reflexes: 78 }
    }
  },
  {
    id: 'cristal',
    name: 'Sporting Cristal',
    shortName: 'SC',
    colors: { primary: 0x00539f, secondary: 0xffffff },
    stats: { shotPower: 79, shotAccuracy: 83, goalkeeping: 79 },
    players: {
      shooter: { name: 'M. Sosa', role: 'Enganche técnico', power: 83 },
      keeper: { name: 'D. Ampuero', role: 'Portero titular', reflexes: 81 }
    }
  },
  {
    id: 'melgar',
    name: 'FBC Melgar',
    shortName: 'MEL',
    colors: { primary: 0xb2001f, secondary: 0x000000 },
    stats: { shotPower: 77, shotAccuracy: 76, goalkeeping: 78 },
    players: {
      shooter: { name: 'B. Alemán', role: 'Nueve de área', power: 81 },
      keeper: { name: 'J. Carbajal', role: 'Portero titular', reflexes: 80 }
    }
  },
  {
    id: 'cienciano',
    name: 'Cienciano',
    shortName: 'CIE',
    colors: { primary: 0xd4141a, secondary: 0xffe000 },
    stats: { shotPower: 75, shotAccuracy: 74, goalkeeping: 75 },
    players: {
      shooter: { name: 'F. Vega', role: 'Delantero móvil', power: 78 },
      keeper: { name: 'S. Rivas', role: 'Portero titular', reflexes: 74 }
    }
  },
  {
    id: 'huancayo',
    name: 'Sport Huancayo',
    shortName: 'SH',
    colors: { primary: 0x1c8c3b, secondary: 0xffffff },
    stats: { shotPower: 74, shotAccuracy: 73, goalkeeping: 73 },
    players: {
      shooter: { name: 'E. Torpoco', role: 'Punta de contragolpe', power: 76 },
      keeper: { name: 'P. Villar', role: 'Portero titular', reflexes: 72 }
    }
  },
  {
    id: 'adt',
    name: 'ADT',
    shortName: 'ADT',
    colors: { primary: 0x6c1d9c, secondary: 0xffffff },
    stats: { shotPower: 73, shotAccuracy: 72, goalkeeping: 74 },
    players: {
      shooter: { name: 'L. Manrique', role: 'Mediapunta', power: 75 },
      keeper: { name: 'H. Grande', role: 'Portero titular', reflexes: 75 }
    }
  },
  {
    id: 'cusco',
    name: 'Cusco FC',
    shortName: 'CUS',
    colors: { primary: 0x9a1f2b, secondary: 0xf2c200 },
    stats: { shotPower: 76, shotAccuracy: 75, goalkeeping: 77 },
    players: {
      shooter: { name: 'D. Pineau', role: 'Nueve referencial', power: 79 },
      keeper: { name: 'C. Otoya', role: 'Portero titular', reflexes: 77 }
    }
  },
  {
    id: 'utc',
    name: 'UTC',
    shortName: 'UTC',
    colors: { primary: 0x0f5fa8, secondary: 0xffffff },
    stats: { shotPower: 72, shotAccuracy: 71, goalkeeping: 72 },
    players: {
      shooter: { name: 'R. Correa', role: 'Volante llegador', power: 74 },
      keeper: { name: 'W. Silva', role: 'Portero titular', reflexes: 71 }
    }
  },
  {
    id: 'vallejo',
    name: 'César Vallejo',
    shortName: 'UCV',
    colors: { primary: 0xffd400, secondary: 0x1a1a1a },
    stats: { shotPower: 74, shotAccuracy: 73, goalkeeping: 73 },
    players: {
      shooter: { name: 'A. Chumacero', role: 'Delantero de área', power: 77 },
      keeper: { name: 'M. Vilca', role: 'Portero titular', reflexes: 73 }
    }
  },
  {
    id: 'grau',
    name: 'Grau',
    shortName: 'GRA',
    colors: { primary: 0x8b0000, secondary: 0xffffff },
    stats: { shotPower: 71, shotAccuracy: 70, goalkeeping: 70 },
    players: {
      shooter: { name: 'I. Salazar', role: 'Delantero joven', power: 73 },
      keeper: { name: 'N. Rojas', role: 'Portero titular', reflexes: 70 }
    }
  },
  {
    id: 'binacional',
    name: 'Binacional',
    shortName: 'BIN',
    colors: { primary: 0x1447a6, secondary: 0xffffff },
    stats: { shotPower: 75, shotAccuracy: 74, goalkeeping: 76 },
    players: {
      shooter: { name: 'O. Ramos', role: 'Killer de área', power: 78 },
      keeper: { name: 'G. Duarte', role: 'Portero titular', reflexes: 76 }
    }
  },
  {
    id: 'chankas',
    name: 'Los Chankas',
    shortName: 'CHK',
    colors: { primary: 0x2e7d32, secondary: 0xffd400 },
    stats: { shotPower: 70, shotAccuracy: 69, goalkeeping: 69 },
    players: {
      shooter: { name: 'H. Curi', role: 'Delantero de banda', power: 72 },
      keeper: { name: 'F. Apaza', role: 'Portero titular', reflexes: 69 }
    }
  },
  {
    id: 'garcilaso',
    name: 'Deportivo Garcilaso',
    shortName: 'DGA',
    colors: { primary: 0x4b2e83, secondary: 0xffffff },
    stats: { shotPower: 73, shotAccuracy: 72, goalkeeping: 71 },
    players: {
      shooter: { name: 'W. Farfán Jr.', role: 'Mediapunta técnico', power: 76 },
      keeper: { name: 'J. Zare', role: 'Portero titular', reflexes: 71 }
    }
  },
  {
    id: 'ayacucho',
    name: 'Ayacucho FC',
    shortName: 'AYA',
    colors: { primary: 0xd32f2f, secondary: 0x1a1a1a },
    stats: { shotPower: 72, shotAccuracy: 71, goalkeeping: 72 },
    players: {
      shooter: { name: 'C. Neira', role: 'Delantero de contención', power: 74 },
      keeper: { name: 'B. Portilla', role: 'Portero titular', reflexes: 72 }
    }
  },
  {
    id: 'comerciantes',
    name: 'Comerciantes Unidos',
    shortName: 'CU',
    colors: { primary: 0xef6c00, secondary: 0x1a1a1a },
    stats: { shotPower: 69, shotAccuracy: 68, goalkeeping: 68 },
    players: {
      shooter: { name: 'Y. Terry', role: 'Delantero revelación', power: 71 },
      keeper: { name: 'R. Balta', role: 'Portero titular', reflexes: 68 }
    }
  }
];

export function getTeamById(id) {
  return TEAMS.find((t) => t.id === id);
}

// Genera un bracket de potencia de 2 (recorta al mayor 2^n <= TEAMS.length)
export function getTournamentTeams(count = 8) {
  const n = Math.min(count, TEAMS.length);
  const pow2 = Math.pow(2, Math.floor(Math.log2(n)));
  return TEAMS.slice(0, pow2);
}
