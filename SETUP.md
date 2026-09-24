# Setup Guide — Dream Destination

Follow these steps in order. It takes about 15 minutes, most of it waiting for downloads.

## 1. Install these first (one time only)

| Tool | Version | Get it from |
|---|---|---|
| Node.js | 20 or newer (LTS is fine) | https://nodejs.org |
| Docker Desktop | any recent version | https://www.docker.com/products/docker-desktop |
| VS Code (optional) | any | https://code.visualstudio.com |

After installing, check both work. Open a terminal (PowerShell on Windows, Terminal on Mac) and run:

```bash
node -v      # should print v20.x or higher
docker -v    # should print a version number
```

**Open Docker Desktop and wait until it says "Engine running" before you continue.** The database lives inside Docker, so nothing works if Docker is switched off.

## 2. Unzip and open the project

1. Unzip the folder anywhere (avoid folders inside OneDrive or with very long paths).
2. Open a terminal **inside the project folder** (the one that contains `package.json`).
   In VS Code: *File → Open Folder*, then *Terminal → New Terminal*.

## 3. Create your settings file

Copy the example settings file to a real one.

**Windows (PowerShell):**
```powershell
copy .env.example .env
```

**Mac / Linux:**
```bash
cp .env.example .env
```

You do not need to edit anything in it. The app works with no API keys.

## 4. Install the packages

```bash
npm install
```

This downloads the libraries (a few minutes the first time).

## 5. Start the database and load the demo data

```bash
npm run setup
```

This one command starts the database, creates the tables, and adds the demo destinations (Coimbatore and the Nilgiris). The first run builds a Docker image, so it can take several minutes. Wait until it finishes with no red errors.

## 6. Run the app

```bash
npm run dev
```

Open **http://localhost:3000** in your browser. You should see the landing page: "Where do you want to dream today?".

To stop the app, press `Ctrl + C` in the terminal.

## Demo logins

Use these to try the different parts of the app.

| Who | Login page | Email | Password |
|---|---|---|---|
| Traveller | `/login` | traveller@demo.dreamdestination.invalid | Traveller@2026 |
| Business owner | `/business/login` | owner.kitchen@demo.dreamdestination.invalid | Owner@2026 |
| Admin | `/admin/login` | admin@demo.dreamdestination.invalid | Admin@2026 |

You can also use the app as a guest without signing in. Each login page only accepts its own kind of account.

## Every day after the first setup

You only need two steps:

1. Open Docker Desktop and wait for "Engine running".
2. In the project folder run:

```bash
npm run db:up
npm run dev
```

## Something went wrong?

| Problem | Fix |
|---|---|
| `docker: command not found` or "cannot connect to the Docker daemon" | Docker Desktop is not running. Open it, wait for "Engine running", and try again. |
| `npm run setup` fails while waiting for the database | Wait a minute and run `npm run setup` again. If it keeps failing, run `docker ps` and check that `dream_postgres` is listed. |
| "port is already allocated" (5433 or 6380) | Another program is using that port. Close it, or stop old containers with `docker compose down`, then run `npm run setup` again. |
| "Port 3000 is in use" | Another app is on port 3000. Close it. Next.js may offer another port such as 3001; use the address it prints. |
| The page shows an error about the database | The database is off. Run `npm run db:up`, then refresh. |
| You want to wipe the data and start fresh | Run `npm run db:reset`. |
| `node -v` shows a version below 20 | Install the newer Node.js from nodejs.org and open a new terminal. |
| Text or pages look old after a change | Stop the app (`Ctrl + C`) and run `npm run dev` again. |

## Handy commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app at http://localhost:3000 |
| `npm run typecheck` | Checks the code for type errors |
| `npm run test:unit` | Runs the fast tests (no database needed) |
| `npm run db:up` | Starts the database |
| `npm run db:reset` | Empties the database and reloads the demo data |
| `npm run verify` | Runs every check (typecheck and all tests). Needs the database running and takes a while. |

## Where things are

| Folder | What is inside |
|---|---|
| `src/app/(traveler)` | Traveller pages, including the landing page (`page.tsx`) |
| `src/app/(business)` | Business owner pages |
| `src/app/(admin)` | Admin pages |
| `src/components` | Shared building blocks (buttons, cards, landing page pieces) |
| `db/` | Database tables (`migrations`) and demo data (`seed`) |
| `tests/` | Unit, integration and end-to-end tests |

For the full background on the project, read `README.md`.

> **Note for developers:** this project uses a newer Next.js than most tutorials describe. Before changing framework code, read the matching guide in `node_modules/next/dist/docs/` (see `AGENTS.md`).
