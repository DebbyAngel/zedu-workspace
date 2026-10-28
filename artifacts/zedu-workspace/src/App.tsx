import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Bell, Check, CheckCircle2, ChevronDown,
  ChevronRight, ChevronUp, Clock3, Code2, Download, FileText, Hash, MoreHorizontal,
  Paperclip, Pause, Play, Plus, Search, Send, Smile, Sparkles,
  UserRound, Users, WandSparkles, X,
} from 'lucide-react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  createAgentRunCheckpoint,
  createChatMessage,
  getGetWorkspaceStateQueryKey,
  useGetWorkspaceState,
} from '@workspace/api-client-react';
import type { AgentRunCheckpointInput, AgentRunStep, ChatMessage, WorkspaceState } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const channels = [
  { name: 'general-dev', count: 0 },
  { name: 'announcements', count: 3 },
  { name: 'backend-go', count: 5 },
  { name: 'frontend-react', count: 2 },
 ] as const;

const initialSteps: AgentRunStep[] = [
  { title: 'Parse Pull Request & Build Logs', description: 'Analyzed PR #482, fetched build logs, identified affected files', status: 'complete' as const, duration: '00:01.5s' },
  { title: 'Inspect Dependency Configuration', description: 'Checking package versions and environment configuration', status: 'paused' as const, duration: '00:02.1s' },
  { title: 'Generate Optimized Fix & Commit Patch', description: 'Apply fix, run tests, create commit and PR update', status: 'pending' as const, duration: '00:00.0s' },
];

type WorkspaceChannel = ChatMessage['channel'];
const queryClient = new QueryClient();

function Home() {
  const workspaceQuery = useGetWorkspaceState();
  const workspaceState = workspaceQuery.data;
  const queryClient = useQueryClient();
  const [activeChannel, setActiveChannel] = useState<WorkspaceChannel>('general-dev');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [override, setOverride] = useState("filepath = 'src/lib/env-urls.ts'");
  const [expandedSteps, setExpandedSteps] = useState([true, true, true]);
  const [notice, setNotice] = useState('');
  const [savingMessage, setSavingMessage] = useState(false);
  const [savingCheckpoint, setSavingCheckpoint] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const messages = workspaceState?.messages ?? [];
  const steps = workspaceState?.agentRun.steps ?? initialSteps;
  const approval = workspaceState?.agentRun.approval ?? 'pending';
  useEffect(() => {
    if (workspaceState) setOverride(workspaceState.agentRun.override);
  }, [workspaceState?.agentRun.override]);

  const visibleChannels = useMemo(() => channels.filter((channel) => channel.name.includes(search.trim().toLowerCase())), [search]);
  const channelMessages = messages.filter((message) => message.channel === activeChannel);
  const visibleMessages = channelMessages.filter((message) => {
    if (!search.trim()) return true;
    return `${message.author} ${message.body}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const doneCount = steps.filter((step) => step.status === 'complete').length;
  const progress = approval === 'approved' ? 100 : Math.round((doneCount / steps.length) * 100);
  const isPaused = steps.some((step) => step.status === 'paused');

  function chooseChannel(name: WorkspaceChannel) {
    setActiveChannel(name);
    setNotice('');
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (!workspaceState) {
      setNotice('Saved workspace history is not loaded yet. Retry loading before sending.');
      return;
    }

    setSavingMessage(true);
    try {
      const message = await createChatMessage({ channel: activeChannel, body: text });
      queryClient.setQueryData<WorkspaceState>(getGetWorkspaceStateQueryKey(), (current) =>
        current ? { ...current, messages: [...current.messages, message] } : current,
      );
      setDraft('');
      if (composerRef.current) composerRef.current.style.height = '22px';
      setNotice('');
    } catch {
      setNotice('Unable to save your message. Your draft is still here; please retry.');
    } finally {
      setSavingMessage(false);
    }
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  async function saveAgentCheckpoint(data: AgentRunCheckpointInput, successNotice: string) {
    setSavingCheckpoint(true);
    try {
      const agentRun = await createAgentRunCheckpoint(data);
      queryClient.setQueryData<WorkspaceState>(getGetWorkspaceStateQueryKey(), (current) =>
        current ? { ...current, agentRun } : current,
      );
      setOverride(agentRun.override);
      setNotice(successNotice);
    } catch {
      setNotice('Unable to save the agent checkpoint. The previous saved status is unchanged.');
    } finally {
      setSavingCheckpoint(false);
    }
  }

  function resumeAgent() {
    const nextSteps: AgentRunStep[] = steps.map((step): AgentRunStep => step.status === 'paused'
      ? { ...step, status: 'complete', duration: '00:03.4s' }
      : step.status === 'pending' ? { ...step, status: 'paused' } : step);
    void saveAgentCheckpoint(
      { steps: nextSteps, override, approval },
      'Agent resumed · next step is ready for your review',
    );
  }

  function stepBack() {
    const nextSteps: AgentRunStep[] = steps.map((step, index): AgentRunStep => {
      if (index === 0) return { ...step, status: 'paused' };
      if (index === 1) return { ...step, status: 'pending' };
      return step;
    });
    void saveAgentCheckpoint(
      { steps: nextSteps, override, approval: 'pending' },
      'Returned to the dependency inspection checkpoint',
    );
  }

  function decideApproval(decision: 'approved' | 'changes') {
    const nextSteps = decision === 'approved'
      ? steps.map((step) => ({ ...step, status: 'complete' as const }))
      : steps.map((step, index) => index === 2 ? { ...step, status: 'paused' as const } : step);
    void saveAgentCheckpoint(
      { steps: nextSteps, override, approval: decision },
      decision === 'approved'
        ? 'Approved · patch committed and checks passed'
        : 'Changes requested · agent paused at approval',
    );
  }

  function toggleStep(index: number) {
    setExpandedSteps((current) => current.map((expanded, item) => item === index ? !expanded : expanded));
  }

  return (
    <main className="workspace" data-testid="workspace-main">
      <header className="topbar">
        <div className="brandmark" aria-label="Zedu">Z.</div>
        <div className="brand-title">Zedu Workspace</div>
        <div className="cohort-tag">COHORT 15</div>
        <label className="top-search">
          <Search size={13} />
          <input data-testid="input-workspace-search" aria-label="Search channels, threads, or Ziki" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search channels, threads, or Ziki..." />
          {search && <button className="icon-action" onClick={() => setSearch('')} aria-label="Clear search" data-testid="button-clear-search"><X size={12} /></button>}
        </label>
        <div className="top-meta">
          <span className="online-text" data-testid="status-online"><i className="online-dot" />142 Online</span>
          <button className="top-icon" aria-label="Notifications" data-testid="button-notifications" onClick={() => setNotice('You’re all caught up on notifications')}><Bell size={15} /></button>
          <div className="profile" data-testid="avatar-profile">PD</div>
          <button className="top-icon" aria-label="Profile menu" data-testid="button-profile-menu" onClick={() => setNotice('Signed in as Priya Desai')}><ChevronDown size={11} /></button>
        </div>
        <a className="download-source" href={`${import.meta.env.BASE_URL}zedu-workspace-project.zip`} download="zedu-workspace-project.zip" aria-label="Download project ZIP" data-testid="link-download-source">
          <Download size={13} /><span>Download ZIP</span>
        </a>
        <button className="canvas-active" data-testid="button-canvas-status" onClick={() => setNotice(isPaused ? 'Ziki Canvas is paused at the current step' : 'Ziki Canvas is running') }><ZapIcon /> Ziki Canvas · {isPaused ? 'Paused' : 'Active'}</button>
      </header>

      <div className="main-grid">
        <aside className="sidebar" aria-label="Workspace navigation">
          <div className="workspace-switcher">
            <div className="workspace-icon"><Code2 size={18} /></div>
            <div><strong>Zedu Workspace</strong><small>Build · Learn · Grow</small></div>
            <ChevronRight size={13} style={{ marginLeft: 'auto', color: '#97a7bd' }} />
          </div>
          <div className="side-heading"><span>Channels</span><button onClick={() => setNotice('Create a channel from your cohort settings')} aria-label="Add channel" data-testid="button-add-channel"><Plus size={14} /></button></div>
          <nav aria-label="Channels" data-testid="list-channels">
            {visibleChannels.length ? visibleChannels.map((channel) => (
              <button key={channel.name} className={`side-link ${activeChannel === channel.name ? 'active' : ''}`} onClick={() => chooseChannel(channel.name)} data-testid={`channel-${channel.name}`}>
                <Hash size={13} /><span>{channel.name}</span>{channel.count > 0 && <span className="count">{channel.count}</span>}
              </button>
            )) : <div className="side-empty" data-testid="text-no-channels">No matching channels</div>}
          </nav>
          <section className="side-section">
            <div className="side-section-title"><UserRound size={13} /><span>Direct Messages</span><button className="icon-action" style={{ marginLeft: 'auto' }} onClick={() => setNotice('Start a direct message by choosing a cohort member')} aria-label="Add direct message" data-testid="button-add-dm"><Plus size={13} /></button></div>
            <div className="member-row"><span className="avatar teal">ZK</span><span className="member-name">Ziki Agent</span><span className="count">1</span></div>
            <div className="member-row"><span className="avatar">TD</span><span className="member-name">Tariq (DevOps)</span></div>
            <div className="member-row"><span className="avatar mauve">AP</span><span className="member-name">Aisha (Frontend)</span></div>
            <div className="member-row"><span className="avatar blue">JD</span><span className="member-name">Daniel (Backend)</span></div>
            <button className="side-link" style={{ marginTop: 3 }} onClick={() => setNotice('Showing all cohort direct messages')} data-testid="button-view-dms"><ChevronDown size={13} /> View all DMs</button>
          </section>
          <button className="agent-card" onClick={() => setNotice('Ziki Agent · ready to help with this pull request')} data-testid="button-ziki-agent">
            <span className="agent-star"><Sparkles size={15} /></span><span><strong>Ziki</strong><small>Your AI coding agent</small></span><ChevronRight size={13} />
          </button>
        </aside>

        <section className="chat-panel" aria-label="Team conversation">
          <div className="channel-header">
            <span className="hash-icon">#</span>
            <div><div className="channel-name" data-testid="text-active-channel">{activeChannel}</div><span className="channel-subtitle">{activeChannel === 'general-dev' ? 'General discussions, dev updates, and team sync.' : `Team conversation in ${activeChannel}.`}</span></div>
            <div className="channel-tools">
              <button aria-label="View members" data-testid="button-channel-members" onClick={() => setNotice('6 cohort members are active in this channel')}><Users size={14} /></button>
              <button aria-label="Pin channel" data-testid="button-pin-channel" onClick={() => setNotice(`#${activeChannel} pinned to your workspace`)}><Activity size={14} /></button>
              <button aria-label="More channel options" data-testid="button-channel-options" onClick={() => setNotice(`More options for #${activeChannel}`)}><MoreHorizontal size={15} /></button>
            </div>
          </div>
          {notice && <div className="notice" role="status" data-testid="status-workspace-notice"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')} data-testid="button-dismiss-notice"><X size={12} /></button></div>}
          <div className="messages" data-testid="list-messages">
            {workspaceQuery.isLoading && <div className="workspace-state-banner" role="status" data-testid="status-messages-loading">Loading saved channel history…</div>}
            {workspaceQuery.isError && !workspaceState && (
              <div className="workspace-state-banner error" role="alert" data-testid="status-messages-error">
                <span>Couldn’t load saved messages. Check your connection and retry.</span>
                <button onClick={() => void workspaceQuery.refetch()} data-testid="button-retry-workspace-load">Retry</button>
              </div>
            )}
            <div className="date-divider">TODAY</div>
            {!workspaceQuery.isLoading && !workspaceQuery.isError && visibleMessages.length === 0 && <div className="message-empty" data-testid="text-no-messages">{search ? `No messages match “${search}”` : 'Nothing here yet. Start the conversation.'}</div>}
            {visibleMessages.map((message) => message.kind === 'pull-request' ? (
              <div className="pr-card" key={message.id} data-testid="card-pull-request">
                <span className="github-mark"><GitHubMark /></span>
                <div className="pr-info"><strong>PR #482 · feat: improve user authentication flow</strong><small>Added session handling and improved error responses</small></div>
                <button className="pr-open" onClick={() => setNotice('Pull request #482 · Ready for review')} data-testid="button-open-pull-request">Open</button>
              </div>
            ) : (
              <article className="message" key={message.id} data-testid={`message-${message.id}`}>
                <div className={`avatar ${message.avatar ?? ''}`}>{message.initials}</div>
                <div>
                  <div className="message-head"><strong>{message.author}</strong><time>{formatMessageTime(message.createdAt)}</time></div>
                  <MessageBody text={message.body} />
                </div>
              </article>
            ))}
          </div>
          <form className="composer" onSubmit={sendMessage} data-testid="form-message-composer">
            <button type="button" className="compose-add" aria-label="Add attachment" onClick={() => setNotice('Attachments are available in the full workspace')} data-testid="button-add-attachment"><Plus size={15} /></button>
            <textarea ref={composerRef} rows={1} aria-label="Type a message" placeholder={savingMessage ? 'Saving message…' : 'Type a message...'} value={draft} disabled={!workspaceState || savingMessage} onChange={(event) => {
              setDraft(event.target.value);
              event.target.style.height = '22px';
              event.target.style.height = `${Math.min(event.target.scrollHeight, 68)}px`;
            }} onKeyDown={handleComposerKey} data-testid="input-message" />
            <div className="composer-tools">
              <button type="button" aria-label="Add emoji reaction" onClick={() => setDraft((current) => current ? `${current} :)` : 'Thanks for the update!')} data-testid="button-message-reaction"><Smile size={14} /></button>
              <button type="button" aria-label="Attach file" onClick={() => setNotice('File attachment is not available in this prototype')} data-testid="button-attach-file"><Paperclip size={14} /></button>
              <button className="send" type="submit" aria-label="Send message" disabled={!workspaceState || savingMessage || !draft.trim()} data-testid="button-send-message"><Send size={14} /></button>
            </div>
          </form>
        </section>

        <section className="execution-panel" aria-label="Ziki agent execution">
          <div className="execution-header">
            <div className="execution-icon"><Sparkles size={18} /></div>
            <div className="execution-title"><strong>Ziki Agent Execution Canvas</strong><small>AI-powered code analysis and execution</small></div>
            <div className="progress-wrap" data-testid="status-execution-progress"><div className="progress-label"><span>{progress}%</span><span>{doneCount}/{steps.length}</span></div><div className="progress-track"><div className="progress-value" style={{ width: `${progress}%` }} /></div></div>
            <div className="runtime"><Clock3 size={12} /> 00:04.2s</div>
          </div>
          {workspaceQuery.isLoading && <div className="workspace-state-banner" role="status" data-testid="status-agent-loading">Loading saved agent checkpoint…</div>}
          {workspaceQuery.isError && !workspaceState && (
            <div className="workspace-state-banner error" role="alert" data-testid="status-agent-error">
              <span>Agent status is unavailable until saved state loads.</span>
              <button onClick={() => void workspaceQuery.refetch()}>Retry</button>
            </div>
          )}
          <div className="steps">
            {steps.map((step, index) => (
              <article key={step.title} className={`step-card ${step.status}`} data-testid={`card-agent-step-${index + 1}`}>
                <div className="step-main">
                  <div className="step-state">{step.status === 'complete' ? <Check size={13} /> : step.status === 'paused' ? <Pause size={12} fill="currentColor" /> : <Clock3 size={13} />}</div>
                  <div>
                    <div className="step-label"><b>Step {index + 1}:</b><span>{step.title}</span></div>
                    <div className="step-desc">{step.description}</div>
                    <span className="step-tag">{step.status === 'complete' ? 'COMPLETED' : step.status === 'paused' ? 'PAUSED BY USER / AWAITING INPUT' : approval === 'approved' ? 'COMPLETED' : 'PENDING APPROVAL'}</span>
                  </div>
                  <div>
                    <button className="step-toggle" aria-label={`${expandedSteps[index] ? 'Collapse' : 'Expand'} step ${index + 1}`} onClick={() => toggleStep(index)} data-testid={`button-toggle-step-${index + 1}`}>{expandedSteps[index] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
                    <span className="step-time"><Clock3 size={10} />{step.duration}</span>
                  </div>
                </div>
                {expandedSteps[index] && step.status === 'paused' && (
                  <div className="step-detail">
                    <div className="override">
                      <label htmlFor="context-override">Editable Context Override</label>
                      <div className="override-field"><input id="context-override" value={override} onChange={(event) => setOverride(event.target.value)} data-testid="input-context-override" /><Code2 size={13} /></div>
                      <div className="step-actions">
                        <button className="primary" onClick={resumeAgent} disabled={!workspaceState || savingCheckpoint} data-testid="button-resume-agent"><Play size={12} /> {savingCheckpoint ? 'Saving…' : 'Resume'}</button>
                        <button onClick={stepBack} disabled={!workspaceState || savingCheckpoint} data-testid="button-step-back"><ArrowLeft size={13} /> Step Back</button>
                      </div>
                    </div>
                  </div>
                )}
                {expandedSteps[index] && step.status === 'pending' && (
                  <div className="step-detail"><div className="step-desc">Review the proposed patch before it is applied to this branch.</div>
                    <div className="approval-actions">
                      <button onClick={() => decideApproval('approved')} disabled={!workspaceState || savingCheckpoint} data-testid="button-approve-changes"><CheckCircle2 size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Approve patch</button>
                      <button onClick={() => decideApproval('changes')} disabled={!workspaceState || savingCheckpoint} data-testid="button-request-changes">Request changes</button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
          <div className="execution-foot" data-testid="status-agent-state"><span className={isPaused ? 'state-paused' : ''}><i className={`online-dot ${isPaused ? 'paused-dot' : ''}`} />{approval === 'approved' ? 'Workflow complete' : isPaused ? 'Paused · waiting for input' : 'Agent running'}</span><button onClick={() => setNotice('Execution log opened · 3 events in this run')} data-testid="button-execution-log"><FileText size={11} /> Execution log <ChevronRight size={11} /></button></div>
        </section>
      </div>

      <section className="process-flow" aria-label="Ziki system process flow">
        <div className="flow-heading">
          <span className="flow-logo"><Users size={18} /></span>
          <div><strong>Ziki System Process Flow</strong><small>From user request to automated resolution</small></div>
          <div className="flow-legend">
            <span className="legend-item"><i className="legend-dot done" />Completed</span>
            <span className="legend-item"><i className="legend-dot paused" />Paused / Human Input</span>
            <span className="legend-item"><i className="legend-dot pending" />Pending Approval</span>
          </div>
        </div>
        <div className="flow-track" data-testid="list-process-flow">
          <FlowStep className="active" icon={<UserRound size={17} />} title="User invokes @Ziki in Thread" description="User mentions Ziki with a task or question" testId="flow-user-invokes" />
          <ArrowRight className="flow-arrow" size={18} />
          <FlowStep className="evaluating" icon={<SettingsIcon />} title="Orchestrator Evaluates Task Complexity (C_eval)" description="Analyzes context, determines required steps" testId="flow-orchestrator" />
          <ArrowRight className="flow-arrow" size={18} />
          <FlowStep className="gate" icon={<Pause size={16} />} title="Pause & Inspect Gate Triggered on Parameter Ambiguity" description="Detects unclear/missing configuration or values" testId="flow-pause-inspect" />
          <ArrowRight className="flow-arrow" size={18} />
          <FlowStep className="approval" icon={<UserRound size={17} />} title="Human Approves State Override" description="Reviews and confirms context changes" testId="flow-human-approval" />
          <ArrowRight className="flow-arrow" size={18} />
          <FlowStep className="done" icon={<Check size={16} />} title="Output Rendered & Artifact Committed" description="Fix applied, tests passed, commit created" testId="flow-output-commit" />
        </div>
      </section>
    </main>
  );
}

function MessageBody({ text }: { text: string }) {
  const codePattern = /(src\/lib\/env-urls\.ts|axios@0\.21\.1)/g;
  const chunks = text.split(codePattern);
  return <p className="message-copy" data-testid="text-message-body">{chunks.map((chunk, index) =>
    chunk === 'src/lib/env-urls.ts' || chunk === 'axios@0.21.1'
      ? <code className="inline-code" key={`${chunk}-${index}`}>{chunk}</code>
      : <span key={`${chunk}-${index}`}>{chunk}</span>)}</p>;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function FlowStep({ className, icon, title, description, testId }: { className: string; icon: ReactNode; title: string; description: string; testId: string }) {
  return <article className={`flow-step ${className}`} data-testid={testId}><span className="flow-step-icon">{icon}</span><div><strong>{title}</strong><p>{description}</p></div></article>;
}

function ZapIcon() {
  return <WandSparkles size={12} />;
}
function SettingsIcon() {
  return <Activity size={20} />;
}
function GitHubMark() {
  return <Code2 size={15} color="#152034" />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
