# Docker Setup Guide

This document explains how to run KPMG AI risk assessment using Docker.

## Quick Start

### Using the make.sh Script (Recommended)

**Local Development (Easiest):**
```bash
# Make the script executable (first time only)
chmod +x make.sh

# Run everything (checks deps, installs, starts dev server)
./make.sh
```

**Docker Deployment:**
```bash
# Build and start with Docker
./make.sh docker-build
./make.sh docker-up

# View logs
./make.sh docker-logs

# Stop containers
./make.sh docker-down
```

### Using Docker Compose Directly

```bash
# Build the image
docker-compose build

# Start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

## Configuration

### Environment Variables

Create a `.env` file in the project root to configure the application:

```bash
# External API URL (default: http://localhost:8000)
VITE_API_URL=http://localhost:8000

# Node environment
NODE_ENV=production
```

### Port Configuration

The application runs on **port 5000** by default. To change this, edit `docker-compose.yml`:

```yaml
ports:
  - "5000:5000"  # Change first number to desired host port
```

## Development vs Production

### Development Mode (with hot reload)

The `docker-compose.yml` is configured for development by default with volume mounts:

```yaml
volumes:
  - .:/app:delegated
  - /app/node_modules
```

This allows live code reloading without rebuilding the image.

### Production Mode

For production deployment:

1. Comment out the volume mounts in `docker-compose.yml`
2. Rebuild the image: `./make.sh docker-build`
3. Start containers: `./make.sh docker-up`

## Available Commands

### make.sh Commands

| Command | Description |
|---------|-------------|
| `./make.sh install` | Install dependencies locally |
| `./make.sh dev` | Start local development server |
| `./make.sh build` | Build for production |
| `./make.sh start` | Start production server locally |
| `./make.sh docker-build` | Build Docker image |
| `./make.sh docker-up` | Start Docker containers |
| `./make.sh docker-down` | Stop Docker containers |
| `./make.sh docker-restart` | Restart containers |
| `./make.sh docker-logs` | View container logs |
| `./make.sh docker-shell` | Open shell in container |
| `./make.sh check` | Check installed dependencies |
| `./make.sh clean` | Clean build artifacts |

## Build Structure

The application uses a two-step build process:

1. **Client Build** (Vite):
   - Output: `dist/public/` directory
   - Contains: `index.html` and `assets/` folder

2. **Server Build** (esbuild):
   - Output: `dist/index.js` (bundled server)
   - Serves static files from `dist/public/`

The Dockerfile copies the entire `dist/` directory, which contains both the server bundle and client assets.

## Troubleshooting

### Verify build structure locally

Before building with Docker, verify the build works locally:

```bash
# Clean and rebuild
npm run build

# Check the output
ls -la dist/
ls -la dist/public/

# Should see:
# dist/index.js (server bundle)
# dist/public/index.html (client entry)
# dist/public/assets/ (client assets)
```

### Container won't start

Check logs:
```bash
./make.sh docker-logs
```

If you see "Cannot find module" errors, the build structure may be incorrect. Verify that:
- `dist/index.js` exists
- `dist/public/index.html` exists
- `npm run build` completes without errors

### Port already in use

Change the host port in `docker-compose.yml`:
```yaml
ports:
  - "5001:5000"  # Use port 5001 on host
```

### Permission issues

If you encounter permission errors, ensure the script is executable:
```bash
chmod +x make.sh
```

### Rebuild after changes

After making changes to dependencies or Dockerfile:
```bash
./make.sh docker-down
./make.sh docker-build
./make.sh docker-up
```

## Health Checks

The container includes health checks that verify the application is responding:

- **Interval**: 30 seconds
- **Timeout**: 5 seconds
- **Retries**: 5
- **Start period**: 30 seconds

Check health status:
```bash
docker-compose ps
```

## Resource Limits

The container is configured with resource limits:

- **Memory**: 1GB max, 256MB reserved
- **CPU**: 1.0 max, 0.5 reserved

Adjust these in `docker-compose.yml` under `deploy.resources` if needed.

## Network Configuration

The application uses a dedicated Docker network (`appnet`). This allows:
- Isolated networking
- Easy addition of other services (databases, APIs)
- Service discovery by container name

## External API Integration

The application expects an external API at `http://localhost:8000` by default.

To connect to a different API:

1. Set `VITE_API_URL` environment variable
2. Or create a `.env` file with the API URL

If the external API is also in Docker, add it to the same network and use container name:

```yaml
environment:
  - VITE_API_URL=http://api-container:8000
```

## Production Deployment

For production:

1. Remove development volume mounts from `docker-compose.yml`
2. Set `NODE_ENV=production`
3. Use proper secrets management (not .env files)
4. Configure reverse proxy (nginx, traefik)
5. Set up proper logging and monitoring
6. Use docker-compose in production mode:

```bash
docker-compose -f docker-compose.yml up -d
```

## Multi-Stage Build

The Dockerfile uses a multi-stage build for optimization:

1. **deps**: Install dependencies
2. **builder**: Build the application
3. **runner**: Production runtime (smallest image)

This results in a smaller final image with only production dependencies.
