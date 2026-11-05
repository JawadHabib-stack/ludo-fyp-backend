-- =====================================================================
-- Ludo FYP — MySQL schema. 19 tables = 19 ERD entities, 24 FKs = 24 ERD relationships.
-- Parents are created before children (FK order).
-- No database name here, so this file can also be imported in phpMyAdmin / HeidiSQL / Workbench.
-- =====================================================================
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1. PLAYERS & SOCIAL
-- ---------------------------------------------------------------------
CREATE TABLE players (
  player_id     INT AUTO_INCREMENT PRIMARY KEY,
  display_name  VARCHAR(50)  NOT NULL,
  avatar        VARCHAR(255) NULL,
  player_type   ENUM('guest','registered') NOT NULL,      -- subtype discriminator
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE guest_users (
  player_id  INT PRIMARY KEY,                             -- PK = FK (subtype of players)
  device_id  VARCHAR(100) NOT NULL UNIQUE,
  CONSTRAINT fk_guest_player FOREIGN KEY (player_id) REFERENCES players(player_id)
) ENGINE=InnoDB;

CREATE TABLE registered_users (
  player_id      INT PRIMARY KEY,                         -- PK = FK (subtype of players)
  username       VARCHAR(30)  NOT NULL UNIQUE,
  email          VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  games_played     INT NOT NULL DEFAULT 0,
  games_won        INT NOT NULL DEFAULT 0,
  tournaments_won  INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_reg_player FOREIGN KEY (player_id) REFERENCES players(player_id)
) ENGINE=InnoDB;

CREATE TABLE friendships (
  friendship_id  INT AUTO_INCREMENT PRIMARY KEY,
  requester_id   INT NOT NULL,
  addressee_id   INT NOT NULL,
  status         ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_friend_pair (requester_id, addressee_id),
  CONSTRAINT chk_friend_not_self CHECK (requester_id <> addressee_id),
  CONSTRAINT fk_friend_requester FOREIGN KEY (requester_id) REFERENCES registered_users(player_id),
  CONSTRAINT fk_friend_addressee FOREIGN KEY (addressee_id) REFERENCES registered_users(player_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. RULES & BOTS
-- ---------------------------------------------------------------------
CREATE TABLE rule_sets (
  rule_set_id            INT AUTO_INCREMENT PRIMARY KEY,
  name                   VARCHAR(50) NOT NULL UNIQUE,
  six_to_unlock          TINYINT(1) NOT NULL DEFAULT 1,   -- 0 = a 1 or a 6 unlocks
  extra_turn_on_six      TINYINT(1) NOT NULL DEFAULT 1,
  extra_turn_on_capture  TINYINT(1) NOT NULL DEFAULT 1,
  extra_turn_on_home     TINYINT(1) NOT NULL DEFAULT 1,
  capture_enabled        TINYINT(1) NOT NULL DEFAULT 1,
  tokens_to_win          TINYINT NOT NULL DEFAULT 4,      -- tokens that must reach home to finish
  turn_seconds           TINYINT NOT NULL DEFAULT 30
) ENGINE=InnoDB;

CREATE TABLE bots (
  bot_id      INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  difficulty  ENUM('easy','hard') NOT NULL DEFAULT 'easy'
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. MATCHES (supertype + 4 subtypes)
-- ---------------------------------------------------------------------
CREATE TABLE matches (
  match_id      INT AUTO_INCREMENT PRIMARY KEY,
  rule_set_id   INT NOT NULL,
  match_type    ENUM('bot','online','room','tournament') NOT NULL,   -- subtype discriminator
  game_mode     ENUM('ffa','2v2') NOT NULL DEFAULT 'ffa',
  max_players   TINYINT NOT NULL DEFAULT 4,
  status        ENUM('waiting','in_progress','finished','cancelled') NOT NULL DEFAULT 'waiting',
  current_seat  TINYINT NULL,     -- seat_no whose turn it is
  dice_value    TINYINT NULL,     -- rolled but not used yet; NULL = current seat must roll
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at    DATETIME NULL,
  ended_at      DATETIME NULL,
  CONSTRAINT chk_match_players CHECK (max_players BETWEEN 2 AND 4),
  CONSTRAINT fk_match_rules FOREIGN KEY (rule_set_id) REFERENCES rule_sets(rule_set_id)
) ENGINE=InnoDB;

CREATE TABLE bot_matches (
  match_id    INT PRIMARY KEY,
  difficulty  ENUM('easy','hard') NOT NULL DEFAULT 'easy',
  CONSTRAINT fk_botmatch_match FOREIGN KEY (match_id) REFERENCES matches(match_id)
) ENGINE=InnoDB;

CREATE TABLE online_matches (
  match_id    INT PRIMARY KEY,
  queue_key   VARCHAR(10) NOT NULL,                         -- 'ffa2' | 'ffa4' | '2v2'
  matched_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_online_match FOREIGN KEY (match_id) REFERENCES matches(match_id)
) ENGINE=InnoDB;

CREATE TABLE room_matches (
  match_id   INT PRIMARY KEY,
  host_id    INT NOT NULL,
  room_code  CHAR(6) NOT NULL UNIQUE,
  CONSTRAINT fk_room_match FOREIGN KEY (match_id) REFERENCES matches(match_id),
  CONSTRAINT fk_room_host  FOREIGN KEY (host_id)  REFERENCES registered_users(player_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. TOURNAMENTS
-- ---------------------------------------------------------------------
CREATE TABLE tournaments (
  tournament_id        INT AUTO_INCREMENT PRIMARY KEY,
  creator_id           INT NOT NULL,                        -- REGISTERED_USER creates TOURNAMENT
  rule_set_id          INT NOT NULL,                        -- RULE_SET governs TOURNAMENT (its matches)
  name                 VARCHAR(100) NOT NULL,
  description          VARCHAR(255) NULL,
  max_participants     TINYINT NOT NULL DEFAULT 8,          -- 2, 4, 8 or 16
  players_per_match    TINYINT NOT NULL DEFAULT 4,          -- 2 = 1v1 knockout, 4 = 4-player matches
  start_time           DATETIME NOT NULL,                   -- registration closes, round 1 is drawn
  round_break_minutes  TINYINT NOT NULL DEFAULT 2,          -- wait before the next round's matches start
  status               ENUM('registration','in_progress','finished','cancelled') NOT NULL DEFAULT 'registration',
  current_round        TINYINT NOT NULL DEFAULT 0,          -- 0 = not started yet
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_tournament_ppm CHECK (players_per_match IN (2, 4)),
  CONSTRAINT fk_tournament_creator FOREIGN KEY (creator_id)  REFERENCES registered_users(player_id),
  CONSTRAINT fk_tournament_rules   FOREIGN KEY (rule_set_id) REFERENCES rule_sets(rule_set_id)
) ENGINE=InnoDB;

CREATE TABLE tournament_matches (
  match_id       INT PRIMARY KEY,
  tournament_id  INT NOT NULL,
  round_no       TINYINT NOT NULL,
  match_no       TINYINT NOT NULL,
  scheduled_at   DATETIME NOT NULL,                         -- when this match starts (earlier if all players are in the lobby)
  UNIQUE KEY uq_tmatch_slot (tournament_id, round_no, match_no),
  CONSTRAINT fk_tmatch_match      FOREIGN KEY (match_id)      REFERENCES matches(match_id),
  CONSTRAINT fk_tmatch_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id)
) ENGINE=InnoDB;

CREATE TABLE tournament_participants (
  participant_id    INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id     INT NOT NULL,
  player_id         INT NOT NULL,
  status            ENUM('active','eliminated','champion') NOT NULL DEFAULT 'active',
  eliminated_round  TINYINT NULL,
  joined_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tournament_player (tournament_id, player_id),
  CONSTRAINT fk_tp_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id),
  CONSTRAINT fk_tp_player     FOREIGN KEY (player_id)     REFERENCES registered_users(player_id)
) ENGINE=InnoDB;

CREATE TABLE tournament_invitations (
  invitation_id  INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id  INT NOT NULL,
  sender_id      INT NOT NULL,
  receiver_id    INT NOT NULL,
  status         ENUM('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',  -- expired = tournament started/cancelled
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tinv_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id),
  CONSTRAINT fk_tinv_sender     FOREIGN KEY (sender_id)     REFERENCES registered_users(player_id),
  CONSTRAINT fk_tinv_receiver   FOREIGN KEY (receiver_id)   REFERENCES registered_users(player_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. SEATS, TEAMS, TOKENS, MOVES
-- ---------------------------------------------------------------------
CREATE TABLE teams (
  team_id   INT AUTO_INCREMENT PRIMARY KEY,
  match_id  INT NOT NULL,
  team_no   TINYINT NOT NULL,                               -- 1 = seats 1+3, 2 = seats 2+4
  UNIQUE KEY uq_team_no (match_id, team_no),
  CONSTRAINT fk_team_match FOREIGN KEY (match_id) REFERENCES matches(match_id)
) ENGINE=InnoDB;

CREATE TABLE match_players (
  match_player_id  INT AUTO_INCREMENT PRIMARY KEY,
  match_id         INT NOT NULL,
  player_id        INT NULL,                                -- human seat
  bot_id           INT NULL,                                -- bot seat
  team_id          INT NULL,                                -- 2v2 only
  seat_no          TINYINT NOT NULL,                        -- 1..4 = colour + turn order
  color            ENUM('red','green','yellow','blue') NOT NULL,
  finish_position  TINYINT NULL,                            -- 1 = winner (set when match ends)
  joined_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_seat (match_id, seat_no),
  UNIQUE KEY uq_player_once (match_id, player_id),
  CONSTRAINT chk_human_or_bot CHECK ((player_id IS NULL) <> (bot_id IS NULL)),  -- exactly one of the two
  CONSTRAINT fk_mp_match  FOREIGN KEY (match_id)  REFERENCES matches(match_id),
  CONSTRAINT fk_mp_player FOREIGN KEY (player_id) REFERENCES players(player_id),
  CONSTRAINT fk_mp_bot    FOREIGN KEY (bot_id)    REFERENCES bots(bot_id),
  CONSTRAINT fk_mp_team   FOREIGN KEY (team_id)   REFERENCES teams(team_id)
) ENGINE=InnoDB;

CREATE TABLE tokens (
  token_id         INT AUTO_INCREMENT PRIMARY KEY,
  match_player_id  INT NOT NULL,
  token_no         TINYINT NOT NULL,                        -- 1..4
  position         TINYINT NOT NULL DEFAULT -1,             -- -1 base | 0-50 track | 51-55 home column | 56 home
  UNIQUE KEY uq_token_no (match_player_id, token_no),
  CONSTRAINT fk_token_seat FOREIGN KEY (match_player_id) REFERENCES match_players(match_player_id)
) ENGINE=InnoDB;

CREATE TABLE moves (
  move_id            INT AUTO_INCREMENT PRIMARY KEY,
  match_player_id    INT NOT NULL,
  token_id           INT NOT NULL,
  captured_token_id  INT NULL,
  dice_value         TINYINT NOT NULL,
  from_position      TINYINT NOT NULL,
  to_position        TINYINT NOT NULL,
  is_auto            TINYINT(1) NOT NULL DEFAULT 0,         -- 1 = played by the server after a timeout
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_move_seat     FOREIGN KEY (match_player_id)   REFERENCES match_players(match_player_id),
  CONSTRAINT fk_move_token    FOREIGN KEY (token_id)          REFERENCES tokens(token_id),
  CONSTRAINT fk_move_captured FOREIGN KEY (captured_token_id) REFERENCES tokens(token_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. ROOM INVITATIONS
-- ---------------------------------------------------------------------
CREATE TABLE room_invitations (
  invitation_id  INT AUTO_INCREMENT PRIMARY KEY,
  match_id       INT NOT NULL,
  sender_id      INT NOT NULL,
  receiver_id    INT NOT NULL,
  status         ENUM('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at     DATETIME NOT NULL,
  CONSTRAINT fk_inv_room     FOREIGN KEY (match_id)    REFERENCES room_matches(match_id),
  CONSTRAINT fk_inv_sender   FOREIGN KEY (sender_id)   REFERENCES registered_users(player_id),
  CONSTRAINT fk_inv_receiver FOREIGN KEY (receiver_id) REFERENCES registered_users(player_id)
) ENGINE=InnoDB;
