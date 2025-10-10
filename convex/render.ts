"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { Sandbox } from "@vercel/sandbox";
import ms from "ms";

export const render = action({
  args: {
    projectId: v.string(),
  },
  handler: async (ctx, { projectId }) => {
    
    const sandbox = await Sandbox.create({
      source: {
        url: "https://github.com/caffeinum/remotion-template",
        type: "git",
      },
      resources: { vcpus: 4 },
      timeout: ms("10m"),
      ports: [3000],
      runtime: "node22",
    });

    console.log(`Installing dependencies...`);
    const install = await sandbox.runCommand({
      cmd: "npm",
      args: ["install", "--loglevel", "info"],
    });

    if (install.exitCode != 0) {
      throw new Error("installing packages failed");
    }

    console.log(`Setting up environment file...`);
    const envSetup = await sandbox.runCommand({
      cmd: "cp",
      args: [".env.example", ".env"],
    });

    if (envSetup.exitCode != 0) {
      console.log(
        "Warning: Could not copy .env.example to .env (template may not exist)"
      );
    }

    console.log(`Starting the development server...`);
    await sandbox.runCommand({
      cmd: "npm",
      args: ["run", "dev"],
      detached: true,
    });

    return {
      sandboxUrl: sandbox.domain(3000),
      projectId,
    };
  },
});
