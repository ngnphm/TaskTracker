import { test, expect } from '@playwright/test';

function buildFakeSupabase({ projectId, userId, email }) {
  const projects = [{ id: projectId, name: 'Demo Project', owner_id: userId, due_date: null }];
  const members = [{ project_id: projectId, user_id: userId, role: 'owner' }];
  const profiles = [{ id: userId, email, display_name: 'Demo User' }];

  function resultFor(table) {
    switch (table) {
      case 'projects':
        return { data: projects, error: null };
      case 'tasks':
      case 'milestones':
      case 'project_meetings':
      case 'project_invitations':
      case 'task_assignees':
      case 'task_dependencies':
      case 'task_comments':
        return { data: [], error: null };
      case 'project_members':
        return { data: members, error: null };
      case 'profiles':
        return { data: profiles, error: null };
      default:
        return { data: [], error: null };
    }
  }

  function builder(table) {
    const state = { table, mode: 'select' };
    const api = {
      select() {
        state.mode = 'select';
        return api;
      },
      order() {
        return api;
      },
      eq() {
        return api;
      },
      in() {
        return api;
      },
      maybeSingle() {
        state.mode = 'maybeSingle';
        return api;
      },
      single() {
        state.mode = 'single';
        return api;
      },
      insert() {
        state.mode = 'write';
        return api;
      },
      upsert() {
        state.mode = 'write';
        return api;
      },
      delete() {
        state.mode = 'write';
        return api;
      },
      then(resolve, reject) {
        try {
          const base = resultFor(state.table);
          if (state.mode === 'maybeSingle' || state.mode === 'single') {
            const first = Array.isArray(base.data) ? base.data[0] ?? null : base.data;
            resolve({ data: first, error: base.error });
            return;
          }
          resolve(base);
        } catch (err) {
          reject(err);
        }
      }
    };
    return api;
  }

  const channelApi = (topic) => ({
    topic,
    on() {
      return channelApi(topic);
    },
    subscribe() {
      return channelApi(topic);
    },
    send() {
      return Promise.resolve();
    }
  });

  return {
    createClient() {
      return {
        auth: {
          async getSession() {
            return { data: { session: { user: { id: userId, email } } }, error: null };
          },
          onAuthStateChange() {},
          async signInWithPassword() {
            return { data: { session: { user: { id: userId, email } } }, error: null };
          },
          async signUp() {
            return { data: { session: { user: { id: userId, email } } }, error: null };
          },
          async signOut() {
            return { error: null };
          }
        },
        from(table) {
          return builder(table);
        },
        async rpc() {
          return { error: null };
        },
        channel(topic) {
          return channelApi(topic);
        },
        removeChannel() {}
      };
    }
  };
}

test('long task titles wrap and row grows (no ellipsis)', async ({ page }) => {
  const projectId = 'proj-test-1';
  const userId = 'user-test-1';
  const email = 'demo@example.com';

  await page.addInitScript(({ projectId, userId, email }) => {
    // Ensure config.js doesn't block auth UI.
    window.SUPABASE_CONFIG = { url: 'https://example.supabase.co', anonKey: 'fake_anon_key' };
    window.supabase = buildFakeSupabase({ projectId, userId, email });

    // Expose helper for debugging if needed.
    window.__WRAP_TEST__ = { projectId, userId, email };
  }, { projectId, userId, email });

  // Provide the fake supabase builder to the init script scope.
  await page.addInitScript(buildFakeSupabase.toString());

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });

  // Wait until app card shows (session restored + projects loaded).
  await expect(page.locator('#appCard')).toBeVisible();
  await expect(page.locator('#taskList')).toBeVisible();

  // Create long task.
  const longTitle = 'THIS IS A VERY LONG TASK TITLE TO VERIFY WRAPPING — '.repeat(7).trim();
  await page.locator('#newTaskTitle').fill(longTitle);
  await page.locator('#newTaskForm').dispatchEvent('submit');

  const title = page.locator('.task-row .task-title-input').first();
  await expect(title).toHaveValue(longTitle);

  // Unfocused geometry + style checks.
  const before = await title.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      whiteSpace: cs.whiteSpace,
      overflow: cs.overflow,
      textOverflow: cs.textOverflow,
      overflowWrap: cs.overflowWrap,
      wordBreak: cs.wordBreak
    };
  });

  expect(before.whiteSpace).toBe('pre-wrap');
  expect(before.textOverflow).not.toBe('ellipsis');
  expect(before.height).toBeGreaterThan(24);

  await page.screenshot({ path: 'wrap_unfocused.png', fullPage: true });

  // Focus state screenshot + ensure height doesn't collapse.
  await title.click();
  await page.waitForTimeout(200);

  const after = await title.evaluate((el) => el.getBoundingClientRect().height);
  expect(after).toBeGreaterThan(24);

  await page.screenshot({ path: 'wrap_focused.png', fullPage: true });
});

