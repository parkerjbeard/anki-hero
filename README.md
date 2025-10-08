# Anki Hero

A modern, local-first flashcard application built with Electron, React, and TypeScript. Anki Hero provides an enhanced alternative to traditional flashcard apps with advanced scheduling algorithms, AI-powered features, and a beautiful, responsive user interface.

## Features

### Core Functionality
- **Deck Management**: Organize flashcards into custom decks with metadata and statistics
- **Smart Review System**: Advanced spaced repetition scheduling based on research-backed algorithms
- **Import/Export**: Support for Anki `.apkg` files and custom formats
- **Local-First**: All data stored locally using SQLite for privacy and performance

### Advanced Features
- **AI Integration**: OpenAI-powered sentence judging and content generation
- **Media Support**: Handle images, audio, and other media files in flashcards
- **Responsive UI**: Modern, dark/light theme support with keyboard shortcuts
- **Real-time Statistics**: Track learning progress with detailed analytics
- **Cross-Platform**: Native desktop app for Windows, macOS, and Linux

### Technical Highlights
- **Type Safety**: Full TypeScript implementation with strict type checking
- **Modern Stack**: React 18, Vite, Zustand for state management
- **Performance**: Optimized rendering with React Query for data fetching
- **Security**: Context isolation and secure IPC communication

## Getting Started

### Prerequisites

- **Node.js**: Version 20.0.0 or higher
- **npm**: Package manager (comes with Node.js)
- **Git**: For cloning the repository

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/anki-hero.git
   cd anki-hero
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

The application will open in a new window with hot-reload enabled for both the renderer and main processes.

### Building for Production

```bash
# Build the application
npm run build

# The built files will be in dist-electron/ and dist/renderer/
```

## Project Architecture

### Directory Structure

```
anki-hero/
├── electron/                 # Main process (Node.js)
│   ├── main.ts             # Application entry point
│   ├── db.ts               # Database operations (SQLite)
│   ├── scheduler.ts        # Spaced repetition algorithms
│   ├── importApkg.ts       # Anki file import functionality
│   ├── judge.ts            # AI-powered content judging
│   └── types.ts            # TypeScript type definitions
├── preload/                 # Preload scripts (secure bridge)
│   └── index.ts            # IPC communication setup
├── src/                     # Renderer process (React app)
│   ├── screens/            # Main application screens
│   │   ├── App.tsx         # Root component
│   │   ├── Decks.tsx       # Deck management interface
│   │   └── Review.tsx      # Flashcard review interface
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility functions
│   ├── state.ts            # Global state management (Zustand)
│   └── types/              # TypeScript definitions
├── types/                   # Shared type definitions
├── dist-electron/          # Compiled main process
├── dist-preload/           # Compiled preload scripts
└── dist/renderer/          # Built React application
```

### Technology Stack

#### Frontend (Renderer Process)
- **React 18**: Modern UI framework with hooks and concurrent features
- **TypeScript**: Type-safe JavaScript with strict configuration
- **Vite**: Fast build tool and development server
- **Zustand**: Lightweight state management
- **React Query**: Server state management and caching
- **CSS**: Modern styling with CSS custom properties

#### Backend (Main Process)
- **Electron**: Cross-platform desktop app framework
- **SQLite**: Local database with better-sqlite3 driver
- **Node.js**: Runtime environment for main process
- **TypeScript**: Full type safety across the application

#### Development Tools
- **ESLint**: Code linting with TypeScript and React rules
- **Prettier**: Code formatting for consistent style
- **Concurrently**: Run multiple npm scripts simultaneously
- **Cross-env**: Cross-platform environment variable handling

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot-reload |
| `npm run build` | Build application for production |
| `npm run lint` | Run ESLint on TypeScript and React files |
| `npm run typecheck` | Run TypeScript compiler without emitting files |
| `npm run format` | Format code using Prettier |

## Configuration

### Environment Variables

Create a `.env` file in the project root for development:

```env
# OpenAI API key for AI features (optional)
OPENAI_API_KEY=your_api_key_here

# Development server URL
VITE_DEV_SERVER_URL=http://localhost:5173
```

### TypeScript Configuration

The project uses multiple TypeScript configurations:
- `tsconfig.json`: Base configuration
- `tsconfig.electron.json`: Main process configuration
- `tsconfig.preload.json`: Preload script configuration
- `tsconfig.renderer.json`: Renderer process configuration
