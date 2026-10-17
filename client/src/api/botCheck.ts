// Cloudflare Turnstile, run on demand before actions that start new work.
// Most visitors never see it; a challenge only appears when Cloudflare is unsure.
// Without VITE_TURNSTILE_SITE_KEY (local development) no token is sent and the server skips the check.

type Turnstile = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile failed to load")));
    script.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the human check. Check your connection or ad blocker, then try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

type Widget = { id: string; pending: { resolve: (token: string) => void; reject: (error: Error) => void } | null };

let widget: Widget | null = null;

async function ensureWidget(): Promise<Widget> {
  if (widget) return widget;
  const turnstile = await loadTurnstile();
  const container = document.createElement("div");
  // Bottom-right, and only visible if Cloudflare decides to show a challenge.
  Object.assign(container.style, { position: "fixed", right: "16px", bottom: "16px", zIndex: "2000" });
  document.body.appendChild(container);

  const state: Widget = { id: "", pending: null };
  const settle = (outcome: { token: string } | { error: Error }) => {
    const pending = state.pending;
    state.pending = null;
    if (!pending) return;
    if ("token" in outcome) pending.resolve(outcome.token);
    else pending.reject(outcome.error);
  };
  state.id = turnstile.render(container, {
    sitekey: SITE_KEY,
    execution: "execute",
    appearance: "interaction-only",
    callback: (token: string) => settle({ token }),
    "error-callback": (code: string) => {
      // 1102xx: this hostname isn't allowed for the site key (e.g. a production key on localhost).
      const message = String(code).startsWith("1102")
        ? `The human check isn't set up for ${location.hostname} (Turnstile error ${code}). Add this hostname to the Turnstile widget, or use Cloudflare's test keys locally.`
        : `The human check failed (Turnstile error ${code}). Please try again.`;
      settle({ error: new Error(message) });
      return true; // handled
    },
    "expired-callback": () => turnstile.reset(state.id),
  });
  widget = state;
  return state;
}

async function nextToken(): Promise<string> {
  const turnstile = await loadTurnstile();
  const current = await ensureWidget();
  turnstile.reset(current.id); // tokens are single-use: always start from a clean widget
  return new Promise<string>((resolve, reject) => {
    current.pending = { resolve, reject };
    turnstile.execute(current.id);
  });
}

// One widget serves every request, so requests take turns: a second one would reset the first.
let queue: Promise<unknown> = Promise.resolve();

/** A fresh, single-use token, or null when bot checks aren't configured. */
export async function getBotCheckToken(): Promise<string | null> {
  if (!SITE_KEY) return null;
  const token = queue.then(nextToken, nextToken);
  queue = token.catch(() => undefined);
  return token;
}

/** Headers carrying a bot-check token, when bot checks are configured. */
export async function botCheckHeaders(): Promise<Record<string, string>> {
  const token = await getBotCheckToken();
  return token ? { "X-Turnstile-Token": token } : {};
}
