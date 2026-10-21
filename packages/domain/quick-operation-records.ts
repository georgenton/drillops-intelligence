import {z} from "zod";
const measurement=z.number().finite().nonnegative().max(1_000_000);
const text=z.string().trim().min(1).max(160);
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null);
const common={
 requestId:z.string().uuid(),logicalKey:z.string().trim().min(1).max(128),
 shiftRevision:z.number().int().positive(),reason:z.string().trim().min(5).max(500),
};
export const quickRecordSchema=z.discriminatedUnion("kind",[
 z.object({...common,kind:z.literal("interval"),record:z.object({startDepthM:measurement,endDepthM:measurement,minutes:z.number().finite().positive().max(720)}).strict().refine(r=>r.endDepthM>r.startDepthM,{message:"El final debe superar el inicio"})}).strict(),
 z.object({...common,kind:z.literal("event"),record:z.object({label:text,hours:z.number().finite().min(0).max(12),time}).strict()}).strict(),
 z.object({...common,kind:z.literal("crown_change"),record:z.object({previousSerial:text.nullable().default(null),nextSerial:text,depthM:measurement,time}).strict().refine(r=>r.previousSerial===null||r.previousSerial!==r.nextSerial,{message:"La corona entrante debe ser distinta"})}).strict(),
 z.object({...common,kind:z.literal("consumption"),record:z.object({item:text,quantity:z.number().finite().positive().max(1_000_000),unit:z.string().trim().min(1).max(40)}).strict()}).strict(),
]);
export type QuickRecordInput=z.infer<typeof quickRecordSchema>;
export type QuickRecordKind=QuickRecordInput["kind"];
export type StoredQuickRecord={id:string;kind:QuickRecordKind;logicalKey:string;payload:QuickRecordInput["record"];createdAt:string};
