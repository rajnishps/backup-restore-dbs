#!/usr/bin/env bun

import { execa } from "execa"
import fs from "fs"
import path from "path"
import prompts from "prompts"
import { DB_URLS } from "./dbs"

const args = process.argv.slice(2)
const command = args[0]

const BACKUP_DIR = path.resolve("./db_backups")
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR)
}

async function backup() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, "_")
    .split(".")[0]

  for (const DB_URL of DB_URLS) {
    const dbName = DB_URL.split("/").pop()?.split("?")[0] || "unknown_db"
    const fileName = path.join(BACKUP_DIR, `${dbName}_${timestamp}.sql`)

    console.log(`📦 Backing up ${dbName} ...`)

    try {
      const { stdout } = await execa("pg_dump", [
        "--no-owner",
        "--no-privileges",
        "--format=plain",
        "--encoding=UTF8",
        DB_URL,
      ])

      // Save to file
      fs.writeFileSync(fileName, stdout)

      console.log(`✅ Backup saved to ${fileName}`)
    } catch (err) {
      console.error(`❌ Failed to backup ${dbName}`, err)
    }
  }
}

async function restore() {
  // Step 1: Get all SQL files in backups folder
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse() // newest first

  if (files.length === 0) {
    console.error("❌ No backup files found in db_backups/")
    process.exit(1)
  }

  // Step 2: Let user choose file
  const { dumpFile } = await prompts({
    type: "select",
    name: "dumpFile",
    message: "Select a backup to restore",
    choices: files.map((file) => ({
      title: file,
      value: path.join(BACKUP_DIR, file),
    })),
  })

  if (!dumpFile) {
    console.log("❌ No file selected, exiting...")
    process.exit(0)
  }

  // Step 3: Ask for target DB URL
  const { targetDb } = await prompts({
    type: "text",
    name: "targetDb",
    message: "Enter target PostgreSQL URL",
    validate: (val) =>
      val.startsWith("postgres://") ? true : "Must start with postgres://",
  })

  // Step 4: Restore (no memory blowup)
  console.log(`📤 Restoring ${dumpFile} → ${targetDb}`)
  try {
    await execa("psql", [targetDb, "-f", dumpFile], {
      stdout: "inherit",
      stderr: "inherit",
    })

    console.log("✅ Restore completed")
  } catch (err) {
    console.error("❌ Restore failed", err)
  }
}

switch (command) {
  case "backup":
    backup()
    break
  case "restore":
    restore()
    break
  default:
    console.log(`Usage:
    bun backup          # Backup all DBs
    bun restore         # Interactive restore`)
}
