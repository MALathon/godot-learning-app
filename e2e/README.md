# E2E Tests

End-to-end tests using Playwright for the Godot Learning App.

## Prerequisites

Before running E2E tests, ensure:

1. **Letta Server** is running on `http://localhost:8283`
   ```bash
   # Start Letta server
   letta server
   ```

2. **Agents are set up**
   ```bash
   cd letta && python setup_agents.py
   ```

3. **Dev server** will be started automatically by Playwright

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI (interactive mode)
npm run test:e2e:ui

# Run with visible browser
npm run test:e2e:headed

# Run all tests (unit + E2E)
npm run test:all
```

## Test Structure

- `api.spec.ts` - API endpoint tests (28 tests)
  - Chat API (/api/chat-letta)
  - Curation API (/api/letta/curate)
  - Lessons API (/api/letta/lessons)
  - Memory API (/api/letta/memory)
  - Reset API (/api/letta/reset)
  - Activity API (/api/letta/activity)

- `frontend.spec.ts` - UI/UX tests (23 tests)
  - Home page navigation
  - Topic page display
  - Floating chat interactions
  - Navigation between pages
  - Responsive design
  - Accessibility basics

- `edge-cases.spec.ts` - Edge case and error handling (30 tests)
  - Malformed requests
  - Large payloads
  - Concurrent requests
  - Unicode/special characters
  - Validation errors
  - Security tests
  - Performance tests

## Test Coverage

| Category | Tests | Coverage |
|----------|-------|----------|
| API Endpoints | 28 | All CRUD operations, error handling |
| Frontend UI | 23 | Navigation, chat, responsive, a11y |
| Edge Cases | 30 | Security, performance, validation |
| **Total** | **81** | |

## Notes

- Tests run sequentially to avoid Letta server conflicts
- Timeout is set to 60s for tests involving Letta API calls
- Screenshots are captured on failure
- HTML report is generated after each run
