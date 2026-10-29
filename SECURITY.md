# Security

## Reporting a problem

Please do not open a public issue for a security problem. Use GitHub's **Report a vulnerability** button on the **Security** tab of this repository (private vulnerability reporting), or email **hello@wharfedale.ai** with "Lead Finder security" in the subject.

Tell us what you found, how to reproduce it and which version or commit you used. We aim to reply within 5 working days and will let you know when a fix is released.

## Supported versions

Only the latest version on the `main` branch is supported.

## How the app is designed to stay safe

- It listens only on `127.0.0.1`, so other devices on your network cannot reach it.
- Keys are read from your own `.env` file or environment and are never sent to the page or saved with your data.
- Your leads are stored only on your computer, in `~/.wharfedale-lead-finder/`.
- Website checks refuse private and local network addresses.
- The search tool is downloaded from its official GitHub release and checked against a fixed size and SHA-256 hash before it runs.
