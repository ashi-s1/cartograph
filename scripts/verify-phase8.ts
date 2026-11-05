import fs from "node:fs";
import path from "node:path";
import { parseRepository } from "../lib/parser/index.ts";
import { getTaxonomyCategories } from "../lib/taxonomy.ts";

async function verify() {
  console.log("==========================================");
  console.log("   PHASE 8 ACCEPTANCE CHECK VERIFICATION   ");
  console.log("==========================================\n");

  // ----------------------------------------------------
  // Acceptance Check 1: Analyse a Next.js repository
  // ----------------------------------------------------
  console.log(">>> CHECK 1: Next.js Repository Analysis...");
  const currentProject = parseRepository({ rootDir: process.cwd() });
  console.log(`Detected Framework: ${currentProject.framework}`);
  if (currentProject.framework !== "nextjs") {
    throw new Error(`Expected framework "nextjs", got "${currentProject.framework}"`);
  }

  // Count roles
  const nextRoleCounts: Record<string, number> = {};
  for (const r of currentProject.roles) {
    nextRoleCounts[r.role] = (nextRoleCounts[r.role] || 0) + 1;
  }
  console.log("Role counts in current project:");
  for (const [role, count] of Object.entries(nextRoleCounts)) {
    console.log(`  - ${role}: ${count}`);
  }

  const taxonomyCategories = getTaxonomyCategories("nextjs");
  const railCategories = taxonomyCategories
    .map((c) => ({ name: c.name, count: nextRoleCounts[c.name] || 0 }))
    .filter((c) => c.count > 0);

  console.log("Next.js Rail Categories (fixed reading order):");
  for (const c of railCategories) {
    console.log(`  [Rail] ${c.name}: ${c.count}`);
  }

  if (!nextRoleCounts["Page routes"] || nextRoleCounts["Page routes"] < 1) {
    throw new Error("Check 1 failed: No Page routes identified in Next.js repo");
  }
  if (!nextRoleCounts["API endpoints"] || nextRoleCounts["API endpoints"] < 1) {
    throw new Error("Check 1 failed: No API endpoints identified in Next.js repo");
  }

  console.log(`Extracted Routes in Next.js repo: ${currentProject.routes.length}`);
  for (const r of currentProject.routes) {
    console.log(`  • [${r.method}] ${r.path} -> ${r.file}`);
  }

  // Check an exact route from current project
  const apiAnalysesRoute = currentProject.routes.find((r) => r.path === "/api/analyses");
  if (!apiAnalysesRoute) {
    throw new Error("Check 1 failed: /api/analyses route not found");
  }
  console.log("CHECK 1 PASSED.\n");

  // ----------------------------------------------------
  // Acceptance Check 2 & 3: NestJS Repository Analysis & Exact Route Extraction
  // ----------------------------------------------------
  console.log(">>> CHECK 2 & 3: NestJS Repository Analysis & Exact Routes...");
  const nestFixtureDir = path.resolve("./test-fixtures/nestjs-test");
  fs.mkdirSync(path.join(nestFixtureDir, "src/users"), { recursive: true });
  fs.mkdirSync(path.join(nestFixtureDir, "src/auth"), { recursive: true });

  fs.writeFileSync(
    path.join(nestFixtureDir, "package.json"),
    JSON.stringify({
      name: "nest-sample",
      dependencies: {
        "@nestjs/common": "^10.0.0",
        "@nestjs/core": "^10.0.0",
      },
    })
  );

  fs.writeFileSync(
    path.join(nestFixtureDir, "src/users/users.controller.ts"),
    `import { Controller, Get, Post, Delete } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  findAll() { return []; }

  @Get(':id')
  findOne() { return null; }

  @Post()
  create() { return null; }

  @Delete(':id')
  remove() { return true; }
}
`
  );

  fs.writeFileSync(
    path.join(nestFixtureDir, "src/users/users.service.ts"),
    `import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  findAll() { return []; }
}
`
  );

  fs.writeFileSync(
    path.join(nestFixtureDir, "src/users/users.module.ts"),
    `import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
`
  );

  fs.writeFileSync(
    path.join(nestFixtureDir, "src/users/user.entity.ts"),
    `export class UserEntity {
  id: string;
  name: string;
}
`
  );

  fs.writeFileSync(
    path.join(nestFixtureDir, "src/auth/auth.controller.ts"),
    `import { Controller, Post, Get } from '@nestjs/common';

@Controller('/api/v1/auth')
export class AuthController {
  @Post('login')
  login() { return {}; }

  @Get('me')
  me() { return {}; }
}
`
  );

  fs.writeFileSync(
    path.join(nestFixtureDir, "src/app.controller.ts"),
    `import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() { return 'ok'; }

  @Get()
  root() { return 'hello'; }
}
`
  );

  const nestProject = parseRepository({ rootDir: nestFixtureDir });
  console.log(`Detected Framework: ${nestProject.framework}`);
  if (nestProject.framework !== "nestjs") {
    throw new Error(`Expected framework "nestjs", got "${nestProject.framework}"`);
  }

  const nestRoleCounts: Record<string, number> = {};
  for (const r of nestProject.roles) {
    nestRoleCounts[r.role] = (nestRoleCounts[r.role] || 0) + 1;
  }
  console.log("NestJS Role counts:");
  for (const [role, count] of Object.entries(nestRoleCounts)) {
    console.log(`  - ${role}: ${count}`);
  }

  if (nestRoleCounts["Controllers"] !== 3) {
    throw new Error(`Expected 3 Controllers, got ${nestRoleCounts["Controllers"]}`);
  }
  if (nestRoleCounts["Services"] !== 1) {
    throw new Error(`Expected 1 Service, got ${nestRoleCounts["Services"]}`);
  }
  if (nestRoleCounts["Modules"] !== 1) {
    throw new Error(`Expected 1 Module, got ${nestRoleCounts["Modules"]}`);
  }
  if (nestRoleCounts["Entities"] !== 1) {
    throw new Error(`Expected 1 Entity, got ${nestRoleCounts["Entities"]}`);
  }

  console.log(`NestJS Extracted Routes: ${nestProject.routes.length}`);
  for (const r of nestProject.routes) {
    console.log(`  • [${r.method}] ${r.path} (from ${r.file})`);
  }

  // Acceptance Check 3: Exact route comparisons
  const expectedRoutes = [
    { method: "GET", path: "/users" },
    { method: "GET", path: "/users/:id" },
    { method: "POST", path: "/users" },
    { method: "DELETE", path: "/users/:id" },
    { method: "POST", path: "/api/v1/auth/login" },
    { method: "GET", path: "/api/v1/auth/me" },
    { method: "GET", path: "/health" },
    { method: "GET", path: "/" },
  ];

  for (const expected of expectedRoutes) {
    const found = nestProject.routes.find(
      (r) => r.method === expected.method && r.path === expected.path
    );
    if (!found) {
      throw new Error(`Check 3 failed: Expected route [${expected.method}] ${expected.path} not found`);
    }
  }

  console.log("All 8 NestJS routes match methods and patterns exactly!");
  console.log("CHECK 2 & 3 PASSED.\n");

  // ----------------------------------------------------
  // Acceptance Check 4: Analyse something matching no adapter
  // ----------------------------------------------------
  console.log(">>> CHECK 4: Non-framework repository analysis (Fallback)...");
  const fallbackFixtureDir = path.resolve("./test-fixtures/fallback-test");
  fs.mkdirSync(path.join(fallbackFixtureDir, "src"), { recursive: true });

  fs.writeFileSync(
    path.join(fallbackFixtureDir, "package.json"),
    JSON.stringify({
      name: "plain-ts-tool",
      dependencies: {
        chalk: "^5.0.0",
      },
    })
  );

  fs.writeFileSync(
    path.join(fallbackFixtureDir, "src/math.ts"),
    `export function add(a: number, b: number) { return a + b; }\n`
  );
  fs.writeFileSync(
    path.join(fallbackFixtureDir, "src/index.ts"),
    `import { add } from './math.ts';\nconsole.log(add(1, 2));\n`
  );

  const fallbackProject = parseRepository({ rootDir: fallbackFixtureDir });
  console.log(`Detected Framework: ${fallbackProject.framework}`);
  if (fallbackProject.framework !== "fallback") {
    throw new Error(`Expected framework "fallback", got "${fallbackProject.framework}"`);
  }

  for (const r of fallbackProject.roles) {
    if (r.role !== "Generic") {
      throw new Error(`Expected role "Generic", got "${r.role}"`);
    }
  }

  if (fallbackProject.routes.length !== 0) {
    throw new Error(`Expected empty routes table, got ${fallbackProject.routes.length} routes`);
  }
  console.log("Fallback repository renders with Generic roles and empty route table!");
  console.log("CHECK 4 PASSED.\n");

  // ----------------------------------------------------
  // Acceptance Check 5: Parser Core Next.js independence
  // ----------------------------------------------------
  console.log(">>> CHECK 5: Parser core independence from framework names...");
  const coreParserFiles = [
    "lib/parser/index.ts",
    "lib/parser/walker.ts",
    "lib/parser/resolver.ts",
    "lib/parser/graph.ts",
    "lib/parser/types.ts",
    "lib/parser/adapters/types.ts",
    "lib/parser/adapters/fallback.ts",
  ];

  for (const relFile of coreParserFiles) {
    const fullPath = path.resolve(relFile);
    const content = fs.readFileSync(fullPath, "utf-8");
    if (content.toLowerCase().includes("nextjs")) {
      throw new Error(`Check 5 failed: "nextjs" found in parser core file ${relFile}!`);
    }
  }

  console.log('"nextjs" appears in the adapter and nowhere in parser core!');
  console.log("CHECK 5 PASSED.\n");

  console.log("==========================================");
  console.log("   ALL PHASE 8 ACCEPTANCE CHECKS PASSED   ");
  console.log("==========================================");
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
