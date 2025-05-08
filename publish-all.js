import fs from "fs";
import path from "path";
import child_process from "child_process";

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("Usage: node publish-all.js <version>");
  process.exit(1);
}

const rootDir = process.cwd();
const packagesDir = path.join(rootDir, "packages");

// Trova tutte le cartelle con package.json
function findPackageDirs(baseDir) {
  const dirs = [];

  const entries = fs.readdirSync(baseDir);
  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const packageJson = path.join(fullPath, "package.json");
      if (fs.existsSync(packageJson)) {
        dirs.push(fullPath);
      }
    }
  }

  return dirs;
}

function updatePackageVersion(packageDir, newVersion) {
  const pkgPath = path.join(packageDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.version = newVersion;

  // Aggiorna eventuali dipendenze interne alla monorepo
  ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].forEach(depType => {
    if (pkg[depType]) {
      for (const dep in pkg[depType]) {
        if (dep.startsWith("@glass-cannon/")) {
          pkg[depType][dep] = newVersion;
        }
      }
    }
  });

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log(`Updated ${pkg.name} to version ${newVersion}`);
}

function publishPackage(packageDir) {
  console.log(`Publishing ${packageDir}...`);
  try {
    child_process.execSync("npm publish --access public", {
      cwd: packageDir,
      stdio: "inherit"
    });
  } catch (err) {
    console.error(`Failed to publish ${packageDir}:`, err.message);
  }
}

function main() {
  const allPackageDirs = [
    rootDir,
    ...findPackageDirs(packagesDir)
  ];

  for (const dir of allPackageDirs) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      updatePackageVersion(dir, newVersion);
    }
  }

  for (const dir of allPackageDirs) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      publishPackage(dir);
    }
  }
}

main();
