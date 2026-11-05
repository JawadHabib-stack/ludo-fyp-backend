// Ludo board numbers and game settings. Change gameplay tuning here.
module.exports = {
  // Token positions are counted from each colour's own start cell:
  // -1 = base, 0-50 = main track, 51-55 = own home column, 56 = home (finished)
  BASE_POS: -1,
  LAST_TRACK_POS: 50,
  HOME_POS: 56,
  TRACK_LENGTH: 52, // cells on the shared main track

  // Global track cell where each colour starts
  START_OFFSET: { red: 0, green: 13, yellow: 26, blue: 39 },
  // Global cells where nobody can be captured: 4 start cells + 4 star cells
  SAFE_CELLS: [0, 8, 13, 21, 26, 34, 39, 47],

  SEAT_COLORS: { 1: 'red', 2: 'green', 3: 'yellow', 4: 'blue' },
  // Which seats are used for 2, 3 or 4 players (2 players sit opposite each other)
  SEATS_FOR_PLAYERS: { 2: [1, 3], 3: [1, 2, 3], 4: [1, 2, 3, 4] },
  // 2v2: team 1 = seats 1 + 3, team 2 = seats 2 + 4
  TEAM_OF_SEAT: { 1: 1, 3: 1, 2: 2, 4: 2 },

  BOT_DELAY_MS: 1000,     // bot "thinking" time
  NO_MOVE_DELAY_MS: 1200, // show the dice for a moment before passing the turn
  START_DELAY_MS: 2000,   // time for clients to join before the first turn

  INVITE_EXPIRY_MINUTES: 10,
  ONLINE_RULE_SET_ID: 1,     // online matches use Classic

  // Tournaments
  TOURNAMENT_LOBBY_SECONDS: 60, // round 1 matches start 1 min after the tournament starts (lobby time)
  TOURNAMENT_TICK_MS: 5000,     // how often the server checks for tournaments / matches that should start
  TOURNAMENT_SIZES: [2, 4, 8, 16],
  TOURNAMENT_MATCH_SIZES: [2, 4], // players per match: 2 = 1v1 knockout

  // Online matchmaking queues
  QUEUES: {
    ffa2: { players: 2, game_mode: 'ffa' },
    ffa4: { players: 4, game_mode: 'ffa' },
    '2v2': { players: 4, game_mode: '2v2' },
  },
};
