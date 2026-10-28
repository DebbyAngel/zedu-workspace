import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const chatMessagesTable = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  channel: text("channel").notNull(),
  author: text("author").notNull(),
  initials: text("initials").notNull(),
  body: text("body").notNull(),
  avatar: text("avatar"),
  kind: text("kind"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ChatMessage = typeof chatMessagesTable.$inferSelect;
