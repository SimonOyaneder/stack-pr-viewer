#!/usr/bin/env node
// Render resources/icon.svg → resources/icon.png (1024×1024) and a macOS
// resources/icon.icns built via `iconutil`. electron-builder auto-derives the
// Windows .ico and Linux PNGs from icon.png.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const resourcesDir = path.join(root, "resources")
const svgPath = path.join(resourcesDir, "icon.svg")
const pngPath = path.join(resourcesDir, "icon.png")
const icnsPath = path.join(resourcesDir, "icon.icns")

const MAC_SIZES = [16, 32, 64, 128, 256, 512, 1024]

async function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))
    })
  })
}

async function main() {
  await mkdir(resourcesDir, { recursive: true })
  const svg = await readFile(svgPath)

  await sharp(svg, { density: 384 })
    .resize(1024, 1024)
    .png({ compressionLevel: 9 })
    .toFile(pngPath)
  console.log(`wrote ${path.relative(root, pngPath)}`)

  if (process.platform !== "darwin") {
    console.log("skipping .icns generation (not macOS)")
    return
  }

  const iconset = await mkdtemp(path.join(tmpdir(), "stack-pr-iconset-"))
  const iconsetDir = `${iconset}.iconset`
  await mkdir(iconsetDir, { recursive: true })

  try {
    for (const size of MAC_SIZES) {
      const png = await sharp(svg, { density: 384 })
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toBuffer()
      await writeFile(path.join(iconsetDir, `icon_${size}x${size}.png`), png)
      if (size <= 512) {
        const png2x = await sharp(svg, { density: 384 })
          .resize(size * 2, size * 2)
          .png({ compressionLevel: 9 })
          .toBuffer()
        await writeFile(path.join(iconsetDir, `icon_${size}x${size}@2x.png`), png2x)
      }
    }
    await run("iconutil", ["-c", "icns", "-o", icnsPath, iconsetDir])
    console.log(`wrote ${path.relative(root, icnsPath)}`)
  } finally {
    await rm(iconset, { recursive: true, force: true }).catch(() => {})
    await rm(iconsetDir, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
