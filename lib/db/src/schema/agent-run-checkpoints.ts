import { jsonb, serial, timestamp, pgTable } from "drizzle-orm/pg-core";

export type AgentRunStep = {
  title: string;
  description: string;
  status: "complete" | "paused" | "pending";
  duration: string;
};

export type AgentRunCheckpointData = {
  steps: AgentRunStep[];
  override: string;
  approval: "pending" | "approved" | "changes";
};

export const agentRunCheckpointsTable = pgTable("agent_run_checkpoints", {
  id: serial("id").primaryKey(),
  state: jsonb("state").$type<AgentRunCheckpointData>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AgentRunCheckpoint =
  typeof agentRunCheckpointsTable.$inferSelect;
