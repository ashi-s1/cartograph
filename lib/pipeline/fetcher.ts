import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { Readable } from "node:stream";

export interface RepoSource {
  owner: string;
  repo: string;
  url: string;
}

export function parseGitHubUrl(rawUrl: string): RepoSource {
  const cleaned = rawUrl.trim().replace(/\.git$/, "");
  const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error(`Invalid GitHub repository URL: "${rawUrl}". Expected format: https://github.com/owner/repo`);
  }
  return {
    owner: match[1],
    repo: match[2],
    url: `https://github.com/${match[1]}/${match[2]}`,
  };
}

export async function fetchRepoArchive(repoUrl: string): Promise<{
  tempDir: string;
  sourceDir: string;
  commitSha: string;
  owner: string;
  repo: string;
}> {
  const { owner, repo } = parseGitHubUrl(repoUrl);

  // 1. Create isolated temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `cartograph-${owner}-${repo}-`));

  // 2. Fetch archive directly from GitHub using HEAD.
  // GitHub's HEAD archive tarball embeds the exact 40-character commit SHA into the top-level directory: "<repo>-<sha>".
  // Fetching HEAD directly avoids an upfront GitHub REST API roundtrip (saving 1.5-3s)
  // and protects against unauthenticated API rate limits (60 requests/hour).
  const tarballUrl = `https://github.com/${owner}/${repo}/archive/HEAD.tar.gz`;
  const response = await fetch(tarballUrl, {
    headers: {
      "User-Agent": "Cartograph-Pipeline",
    },
    redirect: "follow",
  });

  if (!response.ok || !response.body) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(
      `Failed to download repository archive from ${tarballUrl}: HTTP ${response.status} ${response.statusText}`
    );
  }

  // 3. Stream response directly into system tar stdin.
  // This extracts files concurrently as network chunks arrive, avoiding writing a separate 10MB+ .tar.gz file to disk.
  let streamExtracted = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const tarProc = spawn("tar", ["-xzf", "-", "-C", tempDir], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      Readable.fromWeb(response.body as any).pipe(tarProc.stdin);

      tarProc.on("close", () => {
        // Windows bsdtar may exit with code 1 if repository contains Linux symlinks.
        // We verify whether files were extracted below.
        resolve();
      });

      tarProc.on("error", (err) => {
        reject(err);
      });
    });

    const entries = fs.readdirSync(tempDir);
    streamExtracted = entries.some((e) => {
      try {
        return fs.statSync(path.join(tempDir, e)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    streamExtracted = false;
  }

  // 4. Fallback: If streaming pipe failed or didn't extract root directory, fetch buffer and write to disk
  if (!streamExtracted) {
    const archivePath = path.join(tempDir, "repo.tar.gz");
    try {
      const fallbackRes = await fetch(tarballUrl, {
        headers: { "User-Agent": "Cartograph-Pipeline" },
        redirect: "follow",
      });
      if (!fallbackRes.ok) {
        throw new Error(`Fallback fetch failed: HTTP ${fallbackRes.status}`);
      }
      const arrayBuffer = await fallbackRes.arrayBuffer();
      fs.writeFileSync(archivePath, Buffer.from(arrayBuffer));
      execSync(`tar -xzf "${archivePath}" -C "${tempDir}"`, { stdio: "pipe" });
    } catch (fallbackErr: any) {
      const entries = fs.existsSync(tempDir) ? fs.readdirSync(tempDir) : [];
      const hasExtracted = entries.some((e) => {
        try {
          return fs.statSync(path.join(tempDir, e)).isDirectory();
        } catch {
          return false;
        }
      });
      if (!hasExtracted) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        throw new Error(`Failed to extract repository archive: ${fallbackErr.message}`);
      }
    } finally {
      if (fs.existsSync(archivePath)) {
        try {
          fs.unlinkSync(archivePath);
        } catch {}
      }
    }
  }

  // 5. Find extracted directory (usually repo-commitSha or repo-branch)
  const entries = fs.readdirSync(tempDir);
  const extractedDirName = entries.find((e) => {
    try {
      return fs.statSync(path.join(tempDir, e)).isDirectory();
    } catch {
      return false;
    }
  });

  if (!extractedDirName) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Extracted archive did not contain a root directory`);
  }

  const sourceDir = path.join(tempDir, extractedDirName);

  // 6. Extract commit SHA from directory name (format: repo-<sha>)
  let commitSha = "HEAD";
  const parts = extractedDirName.split("-");
  const potentialSha = parts[parts.length - 1];
  if (potentialSha && /^[0-9a-f]{7,40}$/i.test(potentialSha)) {
    commitSha = potentialSha;
  } else {
    // Optional fallback: query GitHub commits API only if sha couldn't be parsed from archive directory
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/HEAD`, {
        headers: {
          "User-Agent": "Cartograph-Pipeline",
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sha) commitSha = data.sha;
      }
    } catch {}
  }

  return {
    tempDir,
    sourceDir,
    commitSha,
    owner,
    repo,
  };
}
