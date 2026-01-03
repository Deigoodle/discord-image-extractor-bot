# discord-image-extractor-bot
Discord Bot that extract images from text-channels and save or upload them to a cloud service


## Development Mode (with hot-reload)

```bash
npm run docker:dev
```

Or manually:
```bash
docker-compose up --build
```

### View logs:
```bash
docker-compose logs -f bot
```

## Production Mode

Production mode builds a minimal optimized image:

```bash
npm run docker:prod
```

Or manually:
```bash
docker-compose -f docker-compose.prod.yml up --build
```

## Stop the containers

```bash
npm run docker:down
```

Or manually:
```bash
docker-compose down
```

## Registering Commands

Before first run, register Discord commands:

### Option 1: Run locally
```bash
npm install
npm run register
```

### Option 2: Run in container
```bash
docker-compose run --rm bot npm run register
```

## Volumes Explained

### Development (`docker-compose.yml`):
```yaml
volumes:
  - ./src:/app/src              # Mount source code (hot-reload)
  - ./tsconfig.json:/app/tsconfig.json
  - /app/node_modules           # Keep node_modules in container
```

### Why anonymous volume for node_modules?
The anonymous volume `/app/node_modules` prevents your local `node_modules` (if any) from overwriting the container's dependencies. This ensures the container uses the correct packages for its environment.