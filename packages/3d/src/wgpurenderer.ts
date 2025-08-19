import { Schema } from "effect";

export const SuperSampleNone = Schema.Literal("none").pipe(Schema.brand("SuperSampleNone"));
export type SuperSampleNone = typeof SuperSampleNone.Type;

export const SuperSampleGPU = Schema.Literal("gpu").pipe(Schema.brand("SuperSampleGPU"));
export type SuperSampleGPU = typeof SuperSampleGPU.Type;

export const SuperSampleCPU = Schema.Literal("cpu").pipe(Schema.brand("SuperSampleCPU"));
export type SuperSampleCPU = typeof SuperSampleCPU.Type;

export const SuperSampleTypeSchema = Schema.Union(SuperSampleNone, SuperSampleGPU, SuperSampleCPU);
export type SuperSampleType = typeof SuperSampleTypeSchema.Type;
