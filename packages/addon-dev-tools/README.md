# @panorama/addon-dev-tools

Development tools for Panorama addons including hot reload server and CLI.

## Installation

```bash
npm install -g @panorama/addon-dev-tools
```

## CLI Commands

### Create New Addon

```bash
panorama create my-awesome-addon
```

### Start Development Server

```bash
# In your addon directory
panorama dev
```

### Build Addon

```bash
panorama build
```

### Package for Distribution

```bash
panorama package
```

### Test Setup

```bash
panorama test
```

## Development Server

The development server provides:

- Hot reload functionality
- File watching
- Auto-building
- Health check endpoints

### API Endpoints

- `GET /health` - Health check
- `GET /status` - Addon status and last modified time
- `GET /manifest.json` - Addon manifest
- `GET /addon.js` - Built addon code
- `GET /files` - List of built files
- `GET /test` - Test connectivity

## Usage in Addon Projects

Add to your addon's `package.json`:

```json
{
  "scripts": {
    "dev:server": "panorama dev"
  },
  "devDependencies": {
    "@panorama/addon-dev-tools": "^1.0.0"
  }
}
```

## Architecture

This package is separate from `@panorama/addon-sdk` to:

- Keep the SDK lightweight for production
- Avoid unnecessary dependencies in addon bundles
- Provide optional development tooling

## License

MIT
