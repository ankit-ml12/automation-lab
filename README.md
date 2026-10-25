# automation-lab

[![ci](https://github.com/ankit-ml12/automation-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/ankit-ml12/automation-lab/actions/workflows/ci.yml)

A monorepo of small, practical automation projects. Each project lives in its own
folder under `projects/` with its own README, setup steps, and tests.

## Projects

| Project | What it does | Status |
|---|---|---|
| [outlook-otp-autofill](projects/outlook-otp-autofill) | Reads one-time passcodes from your Outlook inbox and autofills them in the browser | working |

## Layout

```
automation-lab/
  projects/
    <project-name>/
      README.md
      ...
```

## Adding a project

1. Create `projects/<name>/` with a README that explains what it does and how to run it.
2. Keep dependencies inside the project folder. No root-level package manager.
3. Add a row to the table above.
4. If the project has tests, add a job to `.github/workflows/ci.yml`.

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## Contributing

Each project is self-contained. Open the project folder and follow its README.

## License

MIT. See [LICENSE](LICENSE).
