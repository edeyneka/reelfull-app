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
      { files: Array<Id<"_storage">>; prompt: string },
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
        status: "completed" | "failed";
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
  };
  render: {
    render: FunctionReference<"action", "public", { projectId: string }, any>;
  };
};
export type InternalApiType = {};
