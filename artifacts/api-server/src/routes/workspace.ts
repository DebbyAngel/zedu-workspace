import { randomUUID } from "node:crypto";
import { asc, desc } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateAgentRunCheckpointBody,
  CreateAgentRunCheckpointResponse,
  CreateChatMessageBody,
  CreateChatMessageResponse,
  GetWorkspaceStateResponse,
} from "@workspace/api-zod";
import {
  agentRunCheckpointsTable,
  chatMessagesTable,
  db,
  type AgentRunCheckpointData,
  type AgentRunStep,
} from "@workspace/db";

const router: IRouter = Router();

const initialSteps: AgentRunStep[] = [
  {
    title: "Parse Pull Request & Build Logs",
    description:
      "Analyzed PR #482, fetched build logs, identified affected files",
    status: "complete",
    duration: "00:01.5s",
  },
  {
    title: "Inspect Dependency Configuration",
    description: "Checking package versions and environment configuration",
    status: "paused",
    duration: "00:02.1s",
  },
  {
    title: "Generate Optimized Fix & Commit Patch",
    description: "Apply fix, run tests, create commit and PR update",
    status: "pending",
    duration: "00:00.0s",
  },
];

const initialRun: AgentRunCheckpointData = {
  steps: initialSteps,
  override: "filepath = 'src/lib/env-urls.ts'",
  approval: "pending",
};

type DemoMessage = {
  id: string;
  channel: string;
  author: string;
  initials: string;
  body: string;
  avatar?: string;
  kind?: string;
  daysAgo?: number;
};

const demoMessages: DemoMessage[] = [
  {
    id: "m1",
    channel: "general-dev",
    author: "James Daniel",
    initials: "JD",
    body: "Good news! The pull request for the user-auth improvements is ready for review.",
  },
  {
    id: "pr1",
    channel: "general-dev",
    author: "Pull request",
    initials: "GH",
    body: "",
    kind: "pull-request",
  },
  {
    id: "m2",
    channel: "general-dev",
    author: "Sarah Ahmed",
    initials: "SA",
    body: "Looks good! I’ve reviewed the code. Just one small change needed in src/lib/env-urls.ts. The environment URL should use the new staging domain.",
  },
  {
    id: "m3",
    channel: "general-dev",
    author: "Tariq Dnmel",
    initials: "TD",
    body: "I’m checking the dependency configuration now. The current setup uses axios@0.21.1 which has a known vulnerability. We should upgrade to the latest stable version.",
  },
  {
    id: "m4",
    channel: "general-dev",
    author: "You",
    initials: "PD",
    body: "Thanks! I’ll pause the agent here so I can review the suggested changes and update the environment values.",
  },
  {
    id: "m5",
    channel: "general-dev",
    author: "Ziki Agent",
    initials: "ZK",
    body: "Task paused by user. Awaiting your input to continue with the next step.",
    avatar: "teal",
  },
  {
    id: "a1",
    channel: "announcements",
    author: "Maya Chen",
    initials: "MC",
    body: "Sprint review is set for Thursday at 2:00 PM. Please add your demo notes to the cohort doc before then.",
    avatar: "mauve",
  },
  {
    id: "a2",
    channel: "announcements",
    author: "Zedu Team",
    initials: "ZT",
    body: "The shared staging environment is refreshed. Check the release notes for updated deployment guidelines.",
    daysAgo: 1,
  },
  {
    id: "a3",
    channel: "announcements",
    author: "James Daniel",
    initials: "JD",
    body: "Reminder: cohort pairing sessions are open for booking this week.",
    daysAgo: 1,
  },
  {
    id: "b1",
    channel: "backend-go",
    author: "Tariq Dnmel",
    initials: "TD",
    body: "I pushed the new request validation middleware. The table tests now cover the empty payload and malformed ID cases.",
  },
  {
    id: "b2",
    channel: "backend-go",
    author: "Daniel Kim",
    initials: "DK",
    body: "Nice. Could we make the timeout configurable per service? That would help with the longer-running report endpoint.",
    avatar: "gold",
  },
  {
    id: "b3",
    channel: "backend-go",
    author: "You",
    initials: "PD",
    body: "I’ll take that as a follow-up. Added it to the review notes.",
  },
  {
    id: "f1",
    channel: "frontend-react",
    author: "Aisha Patel",
    initials: "AP",
    body: "The component migration is up. I kept the old props working so we can roll this out incrementally.",
    avatar: "mauve",
  },
  {
    id: "f2",
    channel: "frontend-react",
    author: "Sarah Ahmed",
    initials: "SA",
    body: "Checked the mobile layout on the preview build. The focus states look good; the empty state could use one more hint.",
    avatar: "blue",
  },
];

async function ensureWorkspaceDefaults(): Promise<void> {
  const [existingMessages, existingCheckpoints] = await Promise.all([
    db.select({ id: chatMessagesTable.id }).from(chatMessagesTable).limit(1),
    db
      .select({ id: agentRunCheckpointsTable.id })
      .from(agentRunCheckpointsTable)
      .limit(1),
  ]);

  if (existingMessages.length === 0) {
    const now = Date.now();
    await db
      .insert(chatMessagesTable)
      .values(
        demoMessages.map((message, index) => {
          const { daysAgo = 0, avatar = null, kind = null, ...values } = message;
          return {
            ...values,
            avatar,
            kind,
            createdAt: new Date(
              now -
                daysAgo * 24 * 60 * 60 * 1000 -
                (demoMessages.length - index) * 60 * 1000,
            ),
          };
        }),
      )
      .onConflictDoNothing();
  }

  if (existingCheckpoints.length === 0) {
    await db.insert(agentRunCheckpointsTable).values({ state: initialRun });
  }
}

router.get("/workspace-state", async (req, res): Promise<void> => {
  try {
    await ensureWorkspaceDefaults();
    const [messages, checkpoints] = await Promise.all([
      db
        .select()
        .from(chatMessagesTable)
        .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.id)),
      db
        .select()
        .from(agentRunCheckpointsTable)
        .orderBy(
          desc(agentRunCheckpointsTable.id),
          desc(agentRunCheckpointsTable.createdAt),
        )
        .limit(1),
    ]);

    const checkpoint = checkpoints[0];
    if (!checkpoint) {
      throw new Error("The initial agent checkpoint was not created");
    }

    res.json(
      GetWorkspaceStateResponse.parse({
        messages: messages.map((message) => ({
          ...message,
          createdAt: message.createdAt.toISOString(),
        })),
        agentRun: {
          ...checkpoint.state,
          updatedAt: checkpoint.createdAt.toISOString(),
        },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to load workspace state");
    res.status(500).json({ error: "Unable to load saved workspace state" });
  }
});

router.post("/chat-messages", async (req, res): Promise<void> => {
  const parsed = CreateChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [message] = await db
      .insert(chatMessagesTable)
      .values({
        id: randomUUID(),
        channel: parsed.data.channel,
        author: "You",
        initials: "PD",
        body: parsed.data.body,
      })
      .returning();

    if (!message) {
      throw new Error("The message insert returned no record");
    }

    res.status(201).json(
      CreateChatMessageResponse.parse({
        ...message,
        createdAt: message.createdAt.toISOString(),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to save chat message");
    res.status(500).json({ error: "Unable to save message" });
  }
});

router.post("/agent-run/checkpoints", async (req, res): Promise<void> => {
  const parsed = CreateAgentRunCheckpointBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [checkpoint] = await db
      .insert(agentRunCheckpointsTable)
      .values({ state: parsed.data })
      .returning();

    if (!checkpoint) {
      throw new Error("The checkpoint insert returned no record");
    }

    res.status(201).json(
      CreateAgentRunCheckpointResponse.parse({
        ...checkpoint.state,
        updatedAt: checkpoint.createdAt.toISOString(),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to save agent checkpoint");
    res.status(500).json({ error: "Unable to save agent checkpoint" });
  }
});

export default router;
