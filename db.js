const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "users.json");

const VALID_MODES = ["classic", "burningEarth", "infinite", "burningEarth_infinite"];
const COMPUTER = "COMPUTER";

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, "[]", "utf8");
  }
}

function emptyStats() {
  return { wins: 0, losses: 0, draws: 0 };
}

function normalizeUser(user) {
  const classicStats = user.classic || {
    wins: user.wins ?? 0,
    losses: user.losses ?? 0,
    draws: user.draws ?? 0,
  };
  return {
    name: user.name,
    classic: { ...emptyStats(), ...classicStats },
    burningEarth: { ...emptyStats(), ...user.burningEarth },
    infinite: { ...emptyStats(), ...user.infinite },
    burningEarth_infinite: { ...emptyStats(), ...user.burningEarth_infinite },
  };
}

function readUsers() {
  ensureDataFile();
  try {
    const raw = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    const users = raw.map(normalizeUser);
    const needsMigration = raw.some(
      (u) =>
        !u.classic ||
        !u.burningEarth ||
        !u.infinite ||
        !u.burningEarth_infinite
    );
    if (needsMigration) {
      writeUsers(users);
    }
    return users;
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureDataFile();
  fs.writeFileSync(dbPath, JSON.stringify(users, null, 2), "utf8");
}

function findUserIndex(users, name) {
  const lower = name.toLowerCase();
  return users.findIndex((u) => u.name.toLowerCase() === lower);
}

function getAllUsers() {
  return readUsers().sort((a, b) => a.name.localeCompare(b.name));
}

function createUser(name) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Name is required");
  }
  if (trimmed.toUpperCase() === COMPUTER) {
    throw new Error("Computer cannot be saved as a user");
  }

  const users = readUsers();
  if (findUserIndex(users, trimmed) !== -1) {
    const err = new Error("User already exists");
    err.code = "DUPLICATE";
    throw err;
  }

  const user = {
    name: trimmed,
    classic: emptyStats(),
    burningEarth: emptyStats(),
    infinite: emptyStats(),
    burningEarth_infinite: emptyStats(),
  };
  users.push(user);
  writeUsers(users);
  return user;
}

function deleteUser(name) {
  const users = readUsers();
  const index = findUserIndex(users, name);
  if (index === -1) return false;

  users.splice(index, 1);
  writeUsers(users);
  return true;
}

function updateStats(p1, p2, winner, mode = "classic") {
  if (!VALID_MODES.includes(mode)) {
    throw new Error("Invalid game mode");
  }

  if (p1 === COMPUTER || p2 === COMPUTER) {
    return getAllUsers();
  }

  const users = readUsers();
  const i1 = findUserIndex(users, p1);
  const i2 = findUserIndex(users, p2);

  if (i1 === -1 || i2 === -1) {
    throw new Error("Both players must exist in the database");
  }

  const stats1 = users[i1][mode];
  const stats2 = users[i2][mode];

  if (winner === "X") {
    stats1.wins += 1;
    stats2.losses += 1;
  } else if (winner === "O") {
    stats2.wins += 1;
    stats1.losses += 1;
  } else {
    stats1.draws += 1;
    stats2.draws += 1;
  }

  writeUsers(users);
  return users.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  getAllUsers,
  createUser,
  deleteUser,
  updateStats,
};
