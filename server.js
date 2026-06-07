const fs = require("fs");
const path = require("path");
const db = require("./db");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

let shutdownTimeout = null;

function resetShutdownTimer() {
  if (shutdownTimeout) clearTimeout(shutdownTimeout);
  shutdownTimeout = setTimeout(() => {
    console.log("No active browser tab detected. Shutting down server.");
    process.exit(0);
  }, 5000);
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  let filePath = req.url.split("?")[0];
  if (filePath === "/") filePath = "/index.html";

  const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(ROOT, safePath);

  if (!fullPath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    });
    res.end(content);
  });
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === "POST" && pathname === "/api/heartbeat") {
      resetShutdownTimer();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/api/users") {
      sendJson(res, 200, db.getAllUsers());
      return;
    }

    if (req.method === "POST" && pathname === "/api/users") {
      const body = await readBody(req);
      const user = db.createUser(body.name);
      sendJson(res, 201, user);
      return;
    }

    if (req.method === "DELETE" && pathname.startsWith("/api/users/")) {
      const name = decodeURIComponent(pathname.slice("/api/users/".length));
      const deleted = db.deleteUser(name);
      if (!deleted) {
        sendJson(res, 404, { error: "User not found" });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && pathname === "/api/games/result") {
      const body = await readBody(req);
      const { p1, p2, winner, mode = "classic" } = body;

      if (!p1 || !p2) {
        sendJson(res, 400, { error: "Both players are required" });
        return;
      }

      if (winner !== null && winner !== "X" && winner !== "O") {
        sendJson(res, 400, { error: "Winner must be X, O, or null" });
        return;
      }

      if (
        mode !== "classic" &&
        mode !== "burningEarth" &&
        mode !== "infinite" &&
        mode !== "burningEarth_infinite"
      ) {
        sendJson(res, 400, { error: "Invalid game mode" });
        return;
      }

      if (p1 === "COMPUTER" || p2 === "COMPUTER") {
        sendJson(res, 200, db.getAllUsers());
        return;
      }

      sendJson(res, 200, db.updateStats(p1, p2, winner, mode));
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    if (err.code === "DUPLICATE") {
      sendJson(res, 409, { error: "User already exists" });
      return;
    }
    sendJson(res, 400, { error: err.message || "Bad request" });
  }
}

const server = require("http").createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    await handleApi(req, res, pathname);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Tic Tac Toe server running at http://localhost:${PORT}`);
  resetShutdownTimer();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the other server first, then run: node server.js`,
    );
    process.exit(1);
  }
  throw err;
});
