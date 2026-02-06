# CLAUDE.md — DST-system

## Project Overview

DST-system is a newly initialized repository. It currently contains no application source code, dependencies, or build tooling. The sections below describe the current state and should be updated as the project evolves.

## Repository Structure

```
DST-system/
├── .github/
│   └── workflows/
│       └── blank.yml   # GitHub Actions CI template (placeholder)
├── README              # Empty — needs project description
└── CLAUDE.md           # This file
```

## CI / GitHub Actions

- **Workflow file**: `.github/workflows/blank.yml`
- **Triggers**: push and pull_request on `main`, plus manual `workflow_dispatch`
- **Runner**: `ubuntu-latest`
- **Current state**: placeholder steps (`echo Hello, world!`); no real build, test, or deploy steps yet

## Development Workflow

No build system, package manager, or test framework is configured yet. When they are added, document the following here:

- **Language / runtime**: (not yet chosen)
- **Package manager**: (none)
- **Install dependencies**: (n/a)
- **Build**: (n/a)
- **Run tests**: (n/a)
- **Lint / format**: (n/a)

## Key Commands

_No commands available yet. Update this section as tooling is added._

```bash
# Example placeholders — replace when real tooling is set up:
# npm install        # install dependencies
# npm run build      # build the project
# npm test           # run all tests
# npm run lint       # lint the codebase
```

## Code Conventions

_No conventions established yet. Document decisions here as the project takes shape:_

- Language and style guide
- File and directory naming
- Branching strategy
- Commit message format
- Error handling patterns
- Testing requirements

## Architecture

_No application architecture defined yet. When components are added, describe:_

- High-level system design
- Module boundaries and responsibilities
- Data flow
- External service integrations

## Environment & Configuration

- No `.env` files, Docker configuration, or deployment scripts exist yet.
- No `.gitignore` — one should be added once the language/framework is chosen.

## Notes for AI Assistants

1. The repository is essentially empty. Any task requiring source code will need files to be created from scratch.
2. The GitHub Actions workflow at `.github/workflows/blank.yml` is a default template and should be replaced with real CI steps once the tech stack is decided.
3. Keep this file up to date as the project grows — it serves as the primary onboarding reference.
