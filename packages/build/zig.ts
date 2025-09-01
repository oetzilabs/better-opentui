#!/usr/bin/env bun
import { CliConfig, Command, Options } from "@effect/cli";
import { Command as C, FileSystem, Path } from "@effect/platform";
import { BunContext, BunPath, BunRuntime } from "@effect/platform-bun";
import * as minisignVerify from "@threema/wasm-minisign-verify";
import { Cause, Config, Console, Effect, Layer, Match, Option } from "effect";
import { cmdExec } from "./cmd";
import { DownloaderLive, DownloaderService } from "./downloader";
import { UnknownArchitecture, UnknownPlattform } from "./errors";
import packageJson from "./package.json" with { type: "json" };

// CLI options
const production = Options.boolean("production").pipe(Options.withDefault(false), Options.optional);
const development = Options.boolean("development").pipe(Options.withDefault(true), Options.optional);
const skipVerification = Options.boolean("skip-verification", { aliases: ["sv", "skipVerification"] }).pipe(
  Options.withDefault(false),
  Options.optional
);

const DownloadFolderConfig = Config.string("DOWNLOAD_FOLDER").pipe(Config.withDefault("/tmp/zig-download"));

// Detect platform/arch
const detectPlatform = Effect.fn(function* () {
  const p = process.platform;
  const a = process.arch;

  const platform = Match.value(p).pipe(
    Match.when("darwin", () => "macos" as const),
    Match.when("win32", () => "windows" as const),
    Match.when("linux", () => "linux" as const),
    Match.orElse(() => "unknown" as const)
  );
  if (platform === "unknown") return yield* Effect.fail(new UnknownPlattform({ platform: p }));

  const arch = Match.value(a).pipe(
    Match.when("x64", () => "x86_64" as const),
    Match.when("arm64", () => "aarch64" as const),
    Match.orElse(() => "unknown" as const)
  );
  if (arch === "unknown") return yield* Effect.fail(new UnknownArchitecture({ platform: p, architecture: a }));

  return { platform, arch };
});

// Get latest zig version from website
const getLatestZigVersion = Effect.gen(function* () {
  const downloader = yield* DownloaderService;
  const downloadFolder = yield* DownloadFolderConfig;
  const htmlPath = yield* downloader.download("https://ziglang.org/download/index.html", downloadFolder, "buffer");
  const fs = yield* FileSystem.FileSystem;
  const content = yield* fs.readFileString(htmlPath);
  const match = content.match(/<h2.*?>\s*([0-9]+\.[0-9]+\.[0-9]+)\s*<\/h2>/);
  if (!match) return yield* Effect.fail(new Error("Could not find latest zig version", { cause: match }));
  return match[1];
});

// Fetch mirror list
const fetchMirrors = Effect.gen(function* () {
  const downloader = yield* DownloaderService;
  const downloadFolder = yield* DownloadFolderConfig;
  const mirrorsFile = yield* downloader.download(
    "https://ziglang.org/download/community-mirrors.txt",
    downloadFolder,
    "buffer"
  );
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(mirrorsFile);
  return text.trim().split("\n").filter(Boolean);
});

// Shuffle array
const shuffle = <T>(arr: T[]) =>
  arr
    .map((x) => [Math.random(), x] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([, x]) => x);

// Verify minisign signature
const verifySignature = Effect.fn(function* (data: Uint8Array, sig: string) {
  const zigPublicKeyStr = yield* Config.string("MINISIGN").pipe(
    Config.withDefault("RWSGOq2NVecA2UPNdBUZykf1CCb147pkmdtYxgb3Ti+JO/wCYvhbAb/U")
  ); // obtained from the webpage
  const pub = yield* Effect.try({
    try: () =>
      minisignVerify.PublicKey.decode("untrusted comment: minisign public key 60DF2F3B621B4533\n" + zigPublicKeyStr),
    catch: (e) => new Error("Could not decode minisign public key", { cause: e }),
  });

  const signature = yield* Effect.try({
    try: () => minisignVerify.Signature.decode(sig),
    catch: (e) => new Error("Could not decode minisign signature", { cause: e }),
  });

  return yield* Effect.try({
    try: () => {
      pub.verify(data, signature);
      return true;
    },
    catch: (e) => new Error("Signature mismatch", { cause: e }),
  }).pipe(Effect.catchAll((e) => Effect.succeed(false)));
});

// Try mirrors until a verified tarball is found
const tryMirrors = Effect.fn(function* (mirrors: string[], tarballName: string, skipVerification: boolean) {
  const downloader = yield* DownloaderService;
  const downloadFolder = yield* DownloadFolderConfig;

  for (const mirror of mirrors) {
    const tarUrl = `${mirror}/${tarballName}?source=opentuee`;
    const sigUrl = `${mirror}/${tarballName}.minisig?source=opentuee`;
    try {
      const tarPath = yield* downloader.download(tarUrl, downloadFolder, "buffer");
      if (skipVerification) {
        return tarPath;
      }
      const sigPath = yield* downloader.download(sigUrl, downloadFolder, "buffer");

      const fs = yield* FileSystem.FileSystem;
      const data = yield* fs.readFile(tarPath);
      const sigData = yield* fs.readFileString(sigPath, "utf8");
      yield* Console.log("Verifying...");
      const verified = yield* verifySignature(data, sigData);
      if (verified) {
        yield* Console.log("Verified!");
        return tarPath;
      }
      yield* Console.log(`Signature mismatch for ${mirror}, trying next...`);
    } catch {
      continue;
    }
  }
  return yield* Effect.fail(new Error("No mirror succeeded"));
});

const build = Effect.fn(function* (zigBinary: string = "zig", mode: "ReleaseFast" | "Debug" = "ReleaseFast") {
  yield* Console.log(`Building Zig Project in ${mode} mode`);

  const path = yield* Path.Path;
  const currentDir = process.cwd();
  const zigFolder = path.join(currentDir, "packages/core/src/zig");

  const builCommand = C.make(zigBinary, "build", `-Doptimize=${mode}`).pipe(C.workingDirectory(zigFolder));
  const build = yield* cmdExec(builCommand);
  const buildExit = yield* build.exitCode;
  if (buildExit !== 0) return yield* Effect.fail(new Error("Zig build failed", { cause: buildExit }));

  yield* Console.log("Zig build finished.");
});

const unpackZig = Effect.fn(function* (version: string, tarPath: string, zigFolder: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const tarFolder = path.join(zigFolder, "src", "zig");
  const exists = yield* fs.exists(tarFolder);
  if (!exists) {
    // yield* Console.log(`Creating Zig folder ${tarFolder}`);
    yield* fs.makeDirectory(tarFolder, { recursive: true });
  }
  // yield* Console.log(`Unpacking Zig ${version} to ${zigFolder}`);
  // here I need a way to extract/unzip the file based on the platform
  const p = yield* detectPlatform();
  const command = Match.value(p.platform).pipe(
    Match.when("windows", () => C.make("tar", "xf", tarPath).pipe(C.workingDirectory(zigFolder))),
    Match.when("linux", () => C.make("tar", "xf", tarPath).pipe(C.workingDirectory(zigFolder))),
    Match.orElse(() => C.make("echo", "Not implemented yet"))
  );
  const p2 = yield* cmdExec(command);
  const exitCode = yield* p2.exitCode;
  if (exitCode !== 0) return yield* Effect.fail(new Error("Zig unpack failed", { cause: exitCode }));
  return zigFolder;
});

const getDownloadedZigVersion = Effect.fn(function* (zigFolder: string) {
  const fs = yield* FileSystem.FileSystem;
  const files = yield* fs.readDirectory(zigFolder);
  const zigPath = files.find((f) => f.startsWith("zig-"));
  if (!zigPath) return yield* Effect.fail(new Error("Could not find Zig version", { cause: zigPath }));
  return zigPath;
});

// CLI main command
const command = Command.make(
  "build-zig",
  { production, development, skipVerification },
  Effect.fn(function* ({ development, production, skipVerification }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const zigFolderConfig = yield* Config.string("ZIG_FOLDER").pipe(Config.withDefault(""));
    const zigFolder =
      zigFolderConfig.length === 0
        ? path.join(process.cwd(), ".zig")
        : path.isAbsolute(zigFolderConfig)
          ? zigFolderConfig
          : path.relative(process.cwd(), zigFolderConfig);
    const zigDownloadedAlready = yield* fs.exists(zigFolder);
    let possibleZigBinary = yield* C.make("which", "zig").pipe(C.string);
    let hasZig = possibleZigBinary.length > 0;
    const forceZigInstall = yield* Config.boolean("FORCE_ZIG_INSTALL").pipe(Config.withDefault(false));
    const { platform, arch } = yield* detectPlatform();
    if (!hasZig || forceZigInstall) {
      if (zigDownloadedAlready) {
        hasZig = true;
        const zigPath = yield* getDownloadedZigVersion(zigFolder);
        possibleZigBinary = path.join(zigFolder, zigPath, "zig");
      } else {
        yield* Console.log("Installing Zig... This might take a while.");

        const ext = Match.value(platform).pipe(
          Match.when("windows", () => "zip"),
          Match.when("linux", () => "tar.xz"),
          Match.orElse(() => "tar.xz")
        );

        const latestVersion = yield* getLatestZigVersion;
        const version = yield* Config.string("ZIG_VERSION").pipe(Config.withDefault(latestVersion));
        const tarball = `zig-${arch}-${platform}-${version}.${ext}`;

        const mirrors = shuffle(yield* fetchMirrors);
        const skipVer = Option.isSome(skipVerification) && skipVerification.value;
        const tarPath = yield* tryMirrors(mirrors, tarball, skipVer);
        yield* unpackZig(version, tarPath, zigFolder);
        hasZig = true;
        possibleZigBinary = path.join(zigFolder, `zig-${arch}-${platform}-${version}/zig`);
      }
    }

    const isProd = Option.isSome(production) && production.value;
    const isDev = Option.isSome(development) && development.value;
    yield* build(possibleZigBinary, isProd ? (isDev ? "Debug" : "ReleaseFast") : "ReleaseFast");
  })
);

// CLI runner
const cli = Command.run(command, {
  name: packageJson.name,
  version: packageJson.version,
});

const AppLayer = Layer.mergeAll(
  BunContext.layer,
  BunPath.layer,
  DownloaderLive,
  CliConfig.layer({ showBuiltIns: false, showAllNames: true })
);

cli(Bun.argv).pipe(
  Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause))),
  Effect.scoped,
  Effect.provide(AppLayer),
  BunRuntime.runMain
);
