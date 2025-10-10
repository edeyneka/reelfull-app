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
  };
  render: {
    render: FunctionReference<"action", "public", { projectId: string }, any>;
  };
};
export type InternalApiType = {};
