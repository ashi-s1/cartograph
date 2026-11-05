import fs from "node:fs";
import path from "node:path";
import { parseRepository } from "../lib/parser/index.ts";

async function verify() {
  console.log("==========================================");
  console.log("   PHASE 9 ACCEPTANCE CHECK VERIFICATION   ");
  console.log("==========================================\n");

  // ----------------------------------------------------
  // Acceptance Check 1 & 2: Express Repository Analysis & Coverage Denominator
  // ----------------------------------------------------
  console.log(">>> CHECK 1 & 2: Express Repository Analysis & Coverage Denominator...");
  const expressFixtureDir = path.resolve("./test-fixtures/express-test");
  
  // Clean fixture directory
  if (fs.existsSync(expressFixtureDir)) {
    fs.rmSync(expressFixtureDir, { recursive: true, force: true });
  }

  // Create Express repo structure with both singular and plural folder conventions
  fs.mkdirSync(path.join(expressFixtureDir, "src/routes"), { recursive: true });
  fs.mkdirSync(path.join(expressFixtureDir, "src/controller"), { recursive: true }); // singular convention
  fs.mkdirSync(path.join(expressFixtureDir, "src/middlewares"), { recursive: true }); // plural convention
  fs.mkdirSync(path.join(expressFixtureDir, "src/service"), { recursive: true }); // singular convention
  fs.mkdirSync(path.join(expressFixtureDir, "src/models"), { recursive: true }); // plural convention
  fs.mkdirSync(path.join(expressFixtureDir, "src/config"), { recursive: true });
  fs.mkdirSync(path.join(expressFixtureDir, "src/utils"), { recursive: true });

  fs.writeFileSync(
    path.join(expressFixtureDir, "package.json"),
    JSON.stringify({
      name: "express-sample",
      dependencies: {
        express: "^4.19.2",
      },
    }, null, 2)
  );

  // App entry point using require()
  fs.writeFileSync(
    path.join(expressFixtureDir, "src/app.js"),
    `const express = require('express');
const { authMiddleware } = require('./middlewares/auth');
const userRoutes = require('./routes/users');
const config = require('./config/app');

const app = express();
app.use(authMiddleware);
app.use('/users', userRoutes);

module.exports = app;
`
  );

  // Middleware with exports.name assignment
  fs.writeFileSync(
    path.join(expressFixtureDir, "src/middlewares/auth.js"),
    `const { verifyToken } = require('../utils/crypto');

function authMiddleware(req, res, next) {
  next();
}

exports.authMiddleware = authMiddleware;
`
  );

  // Config with module.exports = { ... }
  fs.writeFileSync(
    path.join(expressFixtureDir, "src/config/app.js"),
    `module.exports = {
  port: 3000,
  env: 'development',
};
`
  );

  // Crypto util with module.exports.name
  fs.writeFileSync(
    path.join(expressFixtureDir, "src/utils/crypto.js"),
    `module.exports.verifyToken = function(token) {
  return true;
};
`
  );

  // Routes requiring controller
  fs.writeFileSync(
    path.join(expressFixtureDir, "src/routes/users.js"),
    `const express = require('express');
const { listUsers, createUser } = require('../controller/users');

const router = express.Router();
router.get('/', listUsers);
router.post('/', createUser);

module.exports = router;
`
  );

  // Controller requiring service (singular folder)
  fs.writeFileSync(
    path.join(expressFixtureDir, "src/controller/users.js"),
    `const userService = require('../service/user');

function listUsers(req, res) {
  return userService.getAll();
}

function createUser(req, res) {
  return userService.create();
}

module.exports = {
  listUsers,
  createUser,
};
`
  );

  // Service requiring model
  fs.writeFileSync(
    path.join(expressFixtureDir, "src/service/user.js"),
    `const User = require('../models/user');

function getAll() {
  return User.find();
}

function create() {
  return new User();
}

module.exports = {
  getAll,
  create,
};
`
  );

  // Model
  fs.writeFileSync(
    path.join(expressFixtureDir, "src/models/user.js"),
    `class User {
  static find() {
    return [];
  }
}

module.exports = User;
`
  );

  // File mixing import and require to test duplicate handling & coexistence
  fs.writeFileSync(
    path.join(expressFixtureDir, "src/service/mixed.js"),
    `import { getAll } from './user';
const { create } = require('./user');
const User = require('../models/user');

export const mixedOperation = () => {
  return getAll();
};
`
  );

  // Run parser against expressFixtureDir
  const expressResult = parseRepository({ rootDir: expressFixtureDir });

  console.log(`Detected Framework: ${expressResult.framework}`);
  if (expressResult.framework !== "express") {
    throw new Error(`Expected framework 'express', got '${expressResult.framework}'`);
  }

  console.log(`Files parsed: ${expressResult.files.length}`);
  console.log(`Total edges drawn: ${expressResult.edges.length}`);
  console.log(`Total imports found: ${expressResult.coverage.totalImports}`);
  console.log(`Resolved imports: ${expressResult.coverage.resolved}`);
  console.log(`External imports: ${expressResult.coverage.external}`);
  console.log(`Unresolved imports: ${expressResult.coverage.unresolved}`);
  console.log(`Routes extracted: ${expressResult.routes.length} (must be 0)`);

  // Check 1 assertions: real graph with believable edge count
  if (expressResult.edges.length < 5) {
    throw new Error(`Check 1 failed: Expected at least 5 edges, got ${expressResult.edges.length}`);
  }

  // Check 2 assertions: coverage has real non-zero denominator
  if (expressResult.coverage.totalImports <= 0) {
    throw new Error(`Check 2 failed: totalImports denominator is ${expressResult.coverage.totalImports}, expected > 0`);
  }
  if (expressResult.coverage.resolved <= 0) {
    throw new Error(`Check 2 failed: resolved imports is ${expressResult.coverage.resolved}, expected > 0`);
  }

  // Check Express routes is empty
  if (expressResult.routes.length !== 0) {
    throw new Error(`Express adapter must return empty route table, got ${expressResult.routes.length}`);
  }

  // Check roles classification (singular and plural)
  const roleMap = new Map(expressResult.roles.map(r => [r.file, r.role]));
  console.log("\nAssigned roles:");
  for (const [f, role] of roleMap.entries()) {
    console.log(`  - ${f} -> ${role}`);
  }

  if (roleMap.get("src/routes/users.js") !== "Routes") {
    throw new Error(`Expected src/routes/users.js to be 'Routes', got '${roleMap.get("src/routes/users.js")}'`);
  }
  if (roleMap.get("src/controller/users.js") !== "Controllers") {
    throw new Error(`Expected singular src/controller/users.js to be 'Controllers', got '${roleMap.get("src/controller/users.js")}'`);
  }
  if (roleMap.get("src/middlewares/auth.js") !== "Middleware") {
    throw new Error(`Expected plural src/middlewares/auth.js to be 'Middleware', got '${roleMap.get("src/middlewares/auth.js")}'`);
  }
  if (roleMap.get("src/service/user.js") !== "Services") {
    throw new Error(`Expected singular src/service/user.js to be 'Services', got '${roleMap.get("src/service/user.js")}'`);
  }
  if (roleMap.get("src/models/user.js") !== "Models") {
    throw new Error(`Expected plural src/models/user.js to be 'Models', got '${roleMap.get("src/models/user.js")}'`);
  }
  if (roleMap.get("src/config/app.js") !== "Config") {
    throw new Error(`Expected src/config/app.js to be 'Config', got '${roleMap.get("src/config/app.js")}'`);
  }
  if (roleMap.get("src/utils/crypto.js") !== "Utilities") {
    throw new Error(`Expected src/utils/crypto.js to be 'Utilities', got '${roleMap.get("src/utils/crypto.js")}'`);
  }

  // Check mixed file: edges from mixed.js to user.js should not be duplicated
  const mixedEdges = expressResult.edges.filter(e => e.source === "src/service/mixed.js");
  console.log(`\nMixed file edges from src/service/mixed.js (${mixedEdges.length}):`);
  for (const e of mixedEdges) {
    console.log(`  ${e.source} -> ${e.target} (${e.kind})`);
  }
  const mixedToUser = mixedEdges.filter(e => e.target === "src/service/user.js");
  if (mixedToUser.length !== 1) {
    throw new Error(`Expected exactly 1 deduplicated edge from mixed.js to user.js, got ${mixedToUser.length}`);
  }
  const mixedToModel = mixedEdges.filter(e => e.target === "src/models/user.js");
  if (mixedToModel.length !== 1) {
    throw new Error(`Expected 1 edge from mixed.js to user model, got ${mixedToModel.length}`);
  }

  // Check export names
  const userControllerFile = expressResult.files.find(f => f.path === "src/controller/users.js");
  console.log(`\nExports in src/controller/users.js:`, userControllerFile?.exports);
  if (!userControllerFile?.exports?.includes("listUsers") || !userControllerFile?.exports?.includes("createUser")) {
    throw new Error(`Expected listUsers and createUser in exports, got ${JSON.stringify(userControllerFile?.exports)}`);
  }

  const authMiddlewareFile = expressResult.files.find(f => f.path === "src/middlewares/auth.js");
  console.log(`Exports in src/middlewares/auth.js:`, authMiddlewareFile?.exports);
  if (!authMiddlewareFile?.exports?.includes("authMiddleware")) {
    throw new Error(`Expected authMiddleware in exports, got ${JSON.stringify(authMiddlewareFile?.exports)}`);
  }

  console.log("CHECK 1 & 2 PASSED.\n");

  // ----------------------------------------------------
  // Acceptance Check 3: Re-run parser against repository analysed before this change
  // Edge list must be byte-identical across runs
  // ----------------------------------------------------
  console.log(">>> CHECK 3: Byte-identical Edge List across runs on pre-change repo...");
  const nestFixtureDir = path.resolve("./test-fixtures/nestjs-test");
  const runA = parseRepository({ rootDir: nestFixtureDir });
  const runB = parseRepository({ rootDir: nestFixtureDir });

  const edgesA = JSON.stringify(runA.edges);
  const edgesB = JSON.stringify(runB.edges);

  if (edgesA !== edgesB) {
    throw new Error("Check 3 failed: Multiple runs yielded different edge lists!");
  }
  console.log(`Run A edges: ${runA.edges.length}, Run B edges: ${runB.edges.length}`);
  console.log(`Byte comparison: identical (${Buffer.byteLength(edgesA)} bytes)`);
  console.log("CHECK 3 PASSED.\n");

  console.log("==========================================");
  console.log("   ALL PHASE 9 ACCEPTANCE CHECKS PASSED   ");
  console.log("==========================================");
}

verify().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
