import { type FunctionReference, anyApi } from "convex/server";
import { type GenericId as Id } from "convex/values";

export const api: PublicApiType = anyApi as unknown as PublicApiType;
export const internal: InternalApiType = anyApi as unknown as InternalApiType;

export type PublicApiType = {
  tasks: {
    get: FunctionReference<"query", "public", Record<string, never>, any>;
    generateUploadUrl: FunctionReference<
      "mutation",
      "public",
      Record<string, never>,
      any
    >;
    createProject: FunctionReference<
      "mutation",
      "public",
      {
        fileMetadata?: Array<{
          contentType: string;
          filename: string;
          size: number;
          storageId: Id<"_storage">;
        }>;
        files: Array<Id<"_storage">>;
        prompt: string;
        thumbnail?: Id<"_storage">;
      },
      any
    >;
    getProjects: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      any
    >;
    getProject: FunctionReference<
      "query",
      "public",
      { id: Id<"projects"> },
      any
    >;
    completeProject: FunctionReference<
      "mutation",
      "public",
      { id: Id<"projects"> },
      any
    >;
    updateProjectWithReelfulData: FunctionReference<
      "mutation",
      "public",
      {
        audioUrl?: string;
        error?: string;
        id: Id<"projects">;
        musicUrl?: string;
        script?: string;
        srtContent?: string;
        status: "completed" | "failed" | "processing";
        videoUrls?: Array<string>;
      },
      any
    >;
    deleteProject: FunctionReference<
      "mutation",
      "public",
      { id: Id<"projects"> },
      any
    >;
    updateProjectStatus: FunctionReference<
      "mutation",
      "public",
      {
        id: Id<"projects">;
        status: "processing" | "completed" | "failed" | "rendering";
      },
      any
    >;
    updateProjectScript: FunctionReference<
      "mutation",
      "public",
      { id: Id<"projects">; script: string },
      any
    >;
    updateProjectWithRenderResult: FunctionReference<
      "mutation",
      "public",
      {
        error?: string;
        id: Id<"projects">;
        renderedVideoUrl?: string;
        status: "completed" | "failed";
      },
      any
    >;
    updateRenderProgress: FunctionReference<
      "mutation",
      "public",
      { details?: string; id: Id<"projects">; step: string },
      any
    >;
    updateProjectSandbox: FunctionReference<
      "mutation",
      "public",
      { id: Id<"projects">; sandboxId: string },
      any
    >;
    simulateCompleted: FunctionReference<
      "mutation",
      "public",
      { id: Id<"projects"> },
      any
    >;
    processProjectWithReelful: FunctionReference<
      "action",
      "public",
      { projectId: Id<"projects">; reelfulApiUrl: string },
      any
    >;
    processProjectWithAI: FunctionReference<
      "action",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    regenerateScript: FunctionReference<
      "action",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    regenerateVoiceover: FunctionReference<
      "action",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    regenerateAnimations: FunctionReference<
      "action",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    regenerateMusic: FunctionReference<
      "action",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    updateRenderStep: FunctionReference<
      "mutation",
      "public",
      {
        error?: string;
        id: Id<"projects">;
        step:
          | "not_started"
          | "creating_sandbox"
          | "uploading_media"
          | "editing_sequence"
          | "rendering_video"
          | "completed"
          | "failed";
      },
      any
    >;
    updateSandboxStatus: FunctionReference<
      "mutation",
      "public",
      { id: Id<"projects">; status: "alive" | "dead" },
      any
    >;
    animateSingleImage: FunctionReference<
      "action",
      "public",
      { imageUrl: string; projectId: Id<"projects"> },
      any
    >;
  };
  render: {
    createSequence: FunctionReference<
      "action",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    downloadSandboxFolder: FunctionReference<
      "action",
      "public",
      { folderPath: string; sandboxId: string },
      any
    >;
    getSandboxFileDownloadUrl: FunctionReference<
      "action",
      "public",
      { filePath: string; sandboxId: string },
      any
    >;
    getSandboxInfo: FunctionReference<
      "action",
      "public",
      { sandboxId: string },
      any
    >;
    listSandboxFiles: FunctionReference<
      "action",
      "public",
      { path?: string; sandboxId: string },
      any
    >;
    readSandboxFile: FunctionReference<
      "action",
      "public",
      { filePath: string; sandboxId: string },
      any
    >;
    renderFinalVideo: FunctionReference<
      "action",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
    runSandboxCommand: FunctionReference<
      "action",
      "public",
      { command: string; sandboxId: string },
      any
    >;
    renderVideo: FunctionReference<
      "action",
      "public",
      { projectId: Id<"projects"> },
      any
    >;
  };
  aiServices: {
    animateImage: FunctionReference<
      "action",
      "public",
      { imageUrl: string; prompt?: string },
      any
    >;
    generateMusic: FunctionReference<
      "action",
      "public",
      { durationMs?: number; prompt: string },
      any
    >;
    generateScript: FunctionReference<
      "action",
      "public",
      { imageUrls?: Array<string>; prompt: string },
      any
    >;
    transcribeAudio: FunctionReference<
      "action",
      "public",
      { audioUrl: string },
      any
    >;
    generateVoiceover: FunctionReference<
      "action",
      "public",
      { text: string; voiceId?: string },
      any
    >;
  };
};
export type InternalApiType = {};
