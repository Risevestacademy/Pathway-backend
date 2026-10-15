# AnalyticsTyped

Fire-and-forget analytics via PostHog.

---

## Configuration

| Variable | Required | Default | Notes |
| :--- | :--- | :--- | :--- |
| `ANALYTICS_ENABLED` | No | `false` | When `false`, no network calls are made and no client is created. |
| `POSTHOG_API_KEY` | Only when `ANALYTICS_ENABLED=true` | — | Enforced by `@ValidateIf`. |
| `POSTHOG_HOST` | No | `https://eu.i.posthog.com` | EU host by default (GDPR compliance). |

---

## Usage

```typescript
constructor(private readonly analytics: AnalyticsService) {}

// No-prop event
this.analytics.capture('email_verified', userId);

// Event with properties
this.analytics.capture('user_signed_up', userId, {
  method: 'password',
});
```

> **Note:** `capture` never throws and never blocks execution. It is safe to call directly inside request handlers without delaying the HTTP response.

---

## Rules

### Event Naming

- **snake_case:** Use `user_signed_up`, not `userSignedUp`.
- **Past tense:** Describe an action that already happened (`user_signed_up`, not `sign_up_user`).
- **Specific:** Use `pathway_saved`, not `user_action`. If you need qualifiers to disambiguate, split them into two distinct events.

### Properties

- **IDs and enums only:** Send specific parameters (e.g., `{ careerId: '...', method: 'password' }`).
- **No PII:** Do not send emails, names, free-text fields, or identifiable personal data.
- **Flat structure only:** Do not use nested objects or arrays. Flatten keys if nesting is needed.

### Emit After Write

Always emit events **after the database write succeeds** — never before.

```typescript
// ✅ Correct: Emits after database write completes
const user = await this.users.create(dto);
this.analytics.capture('user_signed_up', user.id, {
  method: 'password',
});

// ❌ Incorrect: Event fires even if write fails
this.analytics.capture('user_signed_up', 'pending', {
  method: 'password',
});
await this.users.create(dto);
```

> **Why?** Emitting before writes compromises event stream integrity. If a write fails, downstream funnels will count non-existent records.

---

## Adding an Event

1. Add the event name and property shape to `AnalyticsEventMap` in `analytics-events.ts`.
2. Call `capture` from the service owning the database write.
3. The TypeScript type system will reject unknown names and mismatched properties at compile time.

---

## Testing

- `analytics.service.spec.ts`: Tests no-op behavior when disabled, error containment, and shutdown flushing.

---

