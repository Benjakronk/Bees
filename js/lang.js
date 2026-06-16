// BIER -- UI strings, English / Norwegian. LANG indexes every [en, no] pair.
// Loaded before main.js so L() and LANG are globally available everywhere.
'use strict';

let LANG = 0;
try { LANG = localStorage.getItem('bier_lang') === 'no' ? 1 : 0; } catch (e) {}

function setLang(no) {
  LANG = no ? 1 : 0;
  try { localStorage.setItem('bier_lang', no ? 'no' : 'en'); } catch (e) {}
}

const STR = {
  // words
  w_on:  ['ON', 'PÅ'],
  w_off: ['OFF', 'AV'],
  w_day: ['DAY', 'DAG'],
  w_down: ['DOWN', 'NEDE'],
  w_done: ['DONE!', 'FERDIG!'],

  // seasons (also see seasonName, keyed by the SEASONS table)
  s_spring: ['SPRING', 'VÅR'],
  s_summer: ['SUMMER', 'SOMMER'],
  s_autumn: ['AUTUMN', 'HØST'],
  s_winter: ['WINTER', 'VINTER'],

  // title + menus
  ui_start: ['START GAME', 'START SPILL'],
  ui_help: ['HELP', 'HJELP'],
  ui_sound: ['SOUND: {0}', 'LYD: {0}'],
  ui_crt: ['CRT: {0}', 'CRT: {0}'],
  ui_lang: ['LANGUAGE: ENGLISH', 'SPRÅK: NORSK'],
  ui_tagline: ['A HIVE UNDER YOUR WING', 'EN KUBE UNDER DIN VINGE'],
  ui_copyright: ['(C) 1998 BENSOFT INTERACTIVE', '(C) 1998 BENSOFT INTERACTIVE'],

  // world select
  ui_choose: ['CHOOSE A HIVE', 'VELG EN KUBE'],
  ui_hive: ['HIVE {0}', 'KUBE {0}'],
  ui_empty: ['EMPTY - A NEW SWARM AWAITS', 'TOM - EN NY SVERM VENTER'],
  ui_eraseArm: ['X AGAIN TO ERASE!', 'X IGJEN FOR Å SLETTE!'],
  ui_slotKeys: ['ENTER: 1 PLAYER    T: 2 PLAYERS', 'ENTER: 1 SPILLER    T: 2 SPILLERE'],
  ui_slotKeys2: ['X: ERASE    ESC: BACK', 'X: SLETT    ESC: TILBAKE'],

  // intro / help / pause
  ui_pressSpace: ['PRESS SPACE', 'TRYKK MELLOMROM'],
  ui_pressEnter: ['PRESS ENTER', 'TRYKK ENTER'],
  ui_howto: ['HOW TO BEE', 'SLIK SPILLER DU'],
  ui_escBack: ['ESC: BACK', 'ESC: TILBAKE'],
  ui_paused: ['PAUSED', 'PAUSE'],
  ui_resume: ['RESUME', 'FORTSETT'],
  ui_saveGame: ['SAVE GAME', 'LAGRE SPILL'],
  ui_split: ['SPLIT: {0}', 'DELING: {0}'],
  ui_horiz: ['HORIZONTAL', 'VANNRETT'],
  ui_vert: ['VERTICAL', 'LODDRETT'],
  ui_saveQuit: ['SAVE + QUIT', 'LAGRE + AVSLUTT'],

  // takeover (a player bee is lost)
  ui_player: ['PLAYER {0}', 'SPILLER {0}'],
  ui_beeLost: ['BEE LOST', 'BIE TAPT'],
  ui_hiveLives: ['THE HIVE LIVES ON.', 'KUBEN LEVER VIDERE.'],
  ui_continueAs: ['CONTINUE AS:', 'FORTSETT SOM:'],
  ui_hp: ['{0}  HP {1}/{2}', '{0}  HP {1}/{2}'],
  ui_takeOver: ['ENTER: TAKE OVER', 'ENTER: TA OVER'],
  ui_switchBee: ['SWITCH BEE', 'BYTT BIE'],
  ui_switchKeys: ['ENTER: SWITCH   ESC: CANCEL', 'ENTER: BYTT   ESC: AVBRYT'],

  // end screen
  ui_win1: ['THE HIVE WILL', 'KUBEN VIL'],
  ui_win2: ['SURVIVE THE WINTER', 'OVERLEVE VINTEREN'],
  ui_lose1: ['THE HIVE', 'KUBEN'],
  ui_lose2: ['HAS FALLEN', 'HAR FALT'],
  ui_lasted: ['LASTED {0} DAYS', 'HOLDT UT {0} DAGER'],
  ui_finalScore: ['FINAL SCORE: {0}', 'SLUTTPOENG: {0}'],
  ui_honeyStored: ['HONEY STORED: {0}', 'HONNING LAGRET: {0}'],
  ui_broodRaised: ['BROOD RAISED: {0}', 'YNGEL OPPFOSTRET: {0}'],
  ui_beesBorn: ['BEES BORN: {0}', 'BIER FØDT: {0}'],
  ui_beesLost: ['BEES LOST: {0}', 'BIER MISTET: {0}'],
  ui_threatsSlain: ['THREATS SLAIN: {0}', 'TRUSLER FELT: {0}'],

  // HUD / map
  ui_closeMap: ['M: CLOSE MAP', 'M: LUKK KART'],
  ui_score: ['SCORE {0}', 'POENG {0}'],

  // in-game messages
  m_welcome: ['WELCOME BACK TO THE HIVE', 'VELKOMMEN TILBAKE TIL KUBEN'],
  m_flyOut: ['FLY OUT AND GATHER NECTAR', 'FLY UT OG SANK NEKTAR'],
  m_saved: ['HIVE SAVED', 'KUBE LAGRET'],
  m_sound: ['SOUND {0}', 'LYD {0}'],
  m_fed: ['FED THE BROOD', 'MATET YNGELEN'],
  m_laid: ['LAID AN EGG', 'LA ET EGG'],
  m_built: ['BUILT NEW COMB', 'BYGDE NY BIKAKE'],
  m_pFell: ['PLAYER {0} FELL!', 'SPILLER {0} FALT!'],
  m_youFell: ['YOUR BEE FELL!', 'BIEN DIN FALT!'],
  m_queenFell: ['THE QUEEN HAS FALLEN!', 'DRONNINGEN HAR FALT!'],
  m_threatDown: ['{0} IS DOWN!', '{0} ER NEDE!'],
  m_dayN: ['DAY {0} - {1}', 'DAG {0} - {1}'],
  m_nowFlying: ['NOW FLYING: {0}', 'FLYR NÅ: {0}'],
  m_noSwitch: ['NO OTHER BEE TO SWITCH TO', 'INGEN ANNEN BIE Å BYTTE TIL'],
  m_starving: ['THE HIVE IS STARVING!', 'KUBEN SULTER!'],
  m_emerges: ['A NEW {0} EMERGES', 'EN NY {0} KOMMER FREM'],
  m_newQueen: ['THE COLONY RAISES A NEW QUEEN', 'KOLONIEN FOSTRER EN NY DRONNING'],
  m_taskComplete: ['TASK COMPLETE! +{0}', 'OPPDRAG FULLFØRT! +{0}'],
  m_newTask: ['NEW TASK: {0}', 'NYTT OPPDRAG: {0}'],
  m_defend: ['NEW TASK: DEFEND THE HIVE!', 'NYTT OPPDRAG: FORSVAR KUBEN!'],
  m_wasp: ['A WASP IS ON THE HUNT!', 'EN VEPS ER PÅ JAKT!'],
  m_robber: ['ROBBER BEES! GUARD THE HONEY!', 'RØVERBIER! VOKT HONNINGEN!'],
  m_spider: ['A SPIDER LURKS BY THE DOOR...', 'EN EDDERKOPP LURER VED DØREN...'],
  m_hornet: ['A HORNET! THE BROOD IS IN DANGER!', 'EN GEITHAMS! YNGELEN ER I FARE!'],
  m_sound_label: ['SOUND', 'LYD'],

  // tasks (translated from type at draw time -> saves stay language-neutral)
  t_gather: ['GATHER NECTAR', 'SANK NEKTAR'],
  t_feed: ['FEED THE BROOD', 'MAT YNGELEN'],
  t_build: ['BUILD MORE COMB', 'BYGG MER BIKAKE'],
  t_repel: ['REPEL {0}', 'SLÅ TILBAKE {0}'],
  t_store: ['STOCK HONEY FOR WINTER', 'SAML HONNING TIL VINTEREN'],
};

function L(key) {
  const e = STR[key];
  let s = e ? e[LANG] : key;
  for (let i = 1; i < arguments.length; i++) s = s.split('{' + (i - 1) + '}').join(arguments[i]);
  return s;
}

// season name -- SEASONS[].name is a stable English key; translate at draw time
const SEASON_KEY = { SPRING: 's_spring', SUMMER: 's_summer', AUTUMN: 's_autumn', WINTER: 's_winter' };
function seasonName(name) { return L(SEASON_KEY[name] || 'w_done'); }

// caste names (used in HUD, hatch messages, takeover list)
const CASTE_NAME = {
  worker: ['WORKER', 'ARBEIDER'],
  guard: ['GUARD', 'VAKT'],
  drone: ['DRONE', 'DRONE'],
  queen: ['QUEEN', 'DRONNING'],
};
function casteName(c) { return (CASTE_NAME[c] || [c, c])[LANG]; }

// threat names in the definite form English needs ("THE WASP ...")
const THREAT_NAME_DEF = {
  wasp: ['THE WASP', 'VEPSEN'],
  robber: ['THE ROBBER BEE', 'RØVERBIA'],
  spider: ['THE SPIDER', 'EDDERKOPPEN'],
  hornet: ['THE HORNET', 'GEITHAMSEN'],
};
function threatNameDef(k) {
  return (THREAT_NAME_DEF[k] || ['THE ' + String(k).toUpperCase(), String(k).toUpperCase()])[LANG];
}

// tasks carry { type } (+ { kind } for repel) instead of baked text, so a save
// made in one language reads correctly in the other.
function taskText(t) {
  switch (t.type) {
    case 'gather': return L('t_gather');
    case 'feed': return L('t_feed');
    case 'build': return L('t_build');
    case 'store': return L('t_store');
    case 'repel': {
      const k = t.kind || (G.threats.find(x => x.id === t.targetId) || {}).kind;
      return L('t_repel', k ? threatNameDef(k) : '?');
    }
  }
  return t.text || t.type;
}

function introText() {
  return LANG === 1 ? [
    'HØYSOMMER. ENGA SUMMER.',
    '',
    'INNI EN STOR, HUL EIK',
    'STELLER ET BIFOLK SIN KAKE:',
    'GYLLEN HONNING, RAV-GULT PULVER,',
    'OG ET KAMMER FULLT AV BLEK YNGEL.',
    '',
    'DU ER ÉN ARBEIDER BLANT TUSENER.',
    '',
    'SANK FRA BLOMSTENE. FYLL KAKEN.',
    'MAT YNGELEN. STIKK VEPSENE.',
    '',
    'SAML NOK HONNING,',
    'SÅ OVERLEVER KUBEN VINTEREN.',
  ] : [
    'HIGH SUMMER. THE MEADOW HUMS.',
    '',
    'INSIDE A GREAT HOLLOW OAK,',
    'A COLONY OF BEES TENDS ITS COMB:',
    'GOLDEN HONEY, AMBER POLLEN,',
    'AND A NURSERY OF PALE GRUBS.',
    '',
    'YOU ARE ONE WORKER AMONG THOUSANDS.',
    '',
    'FORAGE THE FLOWERS. FILL THE COMB.',
    'FEED THE BROOD. STING THE WASPS.',
    '',
    'STOCK ENOUGH HONEY,',
    'AND THE HIVE WILL SURVIVE THE WINTER.',
  ];
}

function helpText() {
  return LANG === 1 ? [
    ['SPILLER 1', '#ffe080'],
    ['  W A S D ....... FLY', '#c8b890'],
    ['  MELLOMROM ..... STIKK', '#c8b890'],
    ['  E ............. SANK / LEVER / MAT', '#c8b890'],
    ['SPILLER 2', '#80d0ff'],
    ['  PILER ......... FLY     . STIKK     , BRUK', '#c8b890'],
    ['  TAB / L ....... BYTT TIL EN ANNEN BIE', '#c8b890'],
    ['', ''],
    ['HOLD E VED EN BLOMST FOR Å FYLLE OPP', '#a8e8a0'],
    ['MED NEKTAR OG PULVER. HOLD E VED EN CELLE', '#a8e8a0'],
    ['FOR Å LAGRE. HOLD E VED EN SULTEN YNGEL ( ! ).', '#a8e8a0'],
    ['M: KART    ESC: PAUSE', '#a09070'],
  ] : [
    ['PLAYER 1', '#ffe080'],
    ['  W A S D ....... FLY', '#c8b890'],
    ['  SPACE ......... STING', '#c8b890'],
    ['  E ............. GATHER / DEPOSIT / FEED', '#c8b890'],
    ['PLAYER 2', '#80d0ff'],
    ['  ARROWS ........ FLY     . STING     , ACT', '#c8b890'],
    ['  TAB / L ....... SWITCH TO ANOTHER BEE', '#c8b890'],
    ['', ''],
    ['HOLD E AT A FLOWER TO FILL UP ON NECTAR', '#a8e8a0'],
    ['& POLLEN. HOLD E AT A COMB CELL TO STORE.', '#a8e8a0'],
    ['HOLD E AT A HUNGRY GRUB ( ! ) TO FEED IT.', '#a8e8a0'],
    ['M: MAP    ESC: PAUSE', '#a09070'],
  ];
}
