# Agent-Assess - AI Assessment Application

## Overview
Agent-Assess is a full-stack AI assessment application with dynamic model selection, unlimited file upload capabilities, and complete vectorstore management. The application integrates with an external API at `http://localhost:8000` for model management, knowledge base building, vectorstore persistence, and chat functionality.

## Architecture

### Frontend
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: 
  - TanStack Query (React Query v5) for API data fetching
  - React Context for chat state persistence
- **UI Components**: Shadcn UI + Radix UI
- **Styling**: Tailwind CSS with dark mode support

### Backend
- **Framework**: Express.js with TypeScript
- **File Upload**: Multer with memory storage
- **External API**: Proxy to http://localhost:8000

## Key Features

### 1. Model Selection
- Dynamic model dropdown populated from external API `/models` endpoint
- Model selection persisted in localStorage
- Auto-loads vectorstores when model is selected in Settings

### 2. Vectorstore Management

#### General Context (Global Knowledge Base)
- Upload files to build global knowledge base
- Auto-saves to `global_kb_vectorstore/` folder
- Green "Vectorstore Ready" badge when available
- Auto-loads on Settings page when model is selected

#### Company Policy Context
- Upload files for company-specific knowledge
- Auto-saves to `company_kb_vectorstore/` folder
- Green "Vectorstore Ready" badge when available
- Auto-loads on Settings page when model is selected

#### Chat Attachments
- Upload files directly in chat window
- Builds `chat_attachment_vectorstore` on first message send
- Visual indicators:
  - "Processing..." badge while building vectorstore
  - Green "Ready" badge when vectorstore is built
  - Passed to chat API via `use_chat_attachments=true` parameter

### 3. Chat Functionality
- Real-time chat with AI models
- File upload support with drag-and-drop
- Context-aware responses using vectorstores
- Loading states and error handling
- Toast notifications for user feedback
- **State Persistence**: Chat messages and uploaded files persist when navigating between pages
  - Uses React Context (ChatProvider) to maintain state across route changes
  - Messages remain visible when switching to Settings and back
  - Uploaded files are retained during navigation
  - Clear Chat button resets all state (messages + files)

## File Structure

### Key Directories
```
├── chat_attachments/          # Uploaded chat files
├── global_kb_vectorstore/     # General context vectorstore
├── company_kb_vectorstore/    # Company policy vectorstore
├── client/src/
│   ├── types/
│   │   └── index.ts           # Shared TypeScript types (Message interface)
│   ├── hooks/
│   │   └── useChatContext.ts  # Custom hook for chat context
│   ├── pages/
│   │   ├── chat.tsx           # Chat page with file upload
│   │   └── settings.tsx       # Model & vectorstore settings
│   ├── contexts/
│   │   └── ChatContext.tsx    # Chat state persistence provider
│   └── components/
│       ├── ChatInput.tsx      # Chat input with file selector
│       ├── FileUploadBar.tsx  # File upload status bar
│       └── ContextFileUpload.tsx  # Vectorstore file upload
└── server/
    └── routes.ts              # API endpoints
```

## API Endpoints

### Internal Endpoints (Express)
- `GET /api/models` - Fetch available models (transforms format for frontend)

### External API Integration (http://localhost:8000)
**All external API calls made directly from frontend:**

- `GET /models` - List available models
- `POST /build-knowledge-base` - Build knowledge base from uploaded files
  - Method: FormData (multipart)
  - Parameters: `files`, `selected_model`, `kb_type`, `batch_size`, `delay_between_batches`, `max_retries`
  - Response: `{ success, processing_summary, vector_count, ... }`
  
- `POST /save-vectorstore` - Persist vectorstore to disk
  - Method: URLSearchParams (form-urlencoded)
  - Parameters: `kb_type`, `dir_path`
  - Response: `{ success, ... }`
  
- `POST /load-vectorstore` - Load vectorstore from disk into memory
  - Method: URLSearchParams (form-urlencoded)
  - Parameters: `dir_path`, `kb_type`, `model_name`
  - Response: `{ success, ntotal, ... }`
  
- `POST /chat` - Chat with AI using loaded vectorstores
  - Method: JSON
  - Request body: `{ selected_model, user_input, chat_history, global_kb_path, company_kb_path, chat_kb_path }`
  - Response: `{ success, response, loaded_paths }`

## Data Flow

### Chat with Attachments
1. User uploads files in chat window
2. On first message send:
   - **Step 1: Build vectorstore**
     - Frontend calls `http://localhost:8000/build-knowledge-base` directly
     - FormData parameters: `selected_model`, `kb_type=chat`, `batch_size=15`, `delay_between_batches=0.2`, `max_retries=3`, files
     - Creates vectorstore in memory
   - **Step 2: Save to disk**
     - Frontend calls `http://localhost:8000/save-vectorstore`
     - Saves to `chat_attachment_vectorstore/` folder
   - Shows "Processing..." badge during both steps
3. After vectorstore built and saved:
   - Shows green "✓ Chat Attachments Ready" toast with stats
   - Shows green "Ready" badge in upload bar
4. User sends chat message:
   - **Pre-chat vectorstore loading**: Frontend loads ALL vectorstores into memory
     - Calls `/load-vectorstore` for `global_kb_vectorstore` (kb_type=global)
     - Calls `/load-vectorstore` for `company_kb_vectorstore` (kb_type=company)
     - Calls `/load-vectorstore` for `chat_attachment_vectorstore` (kb_type=chat) **if attachments exist**
     - Uses `Promise.allSettled` for parallel loading (continues even if one fails)
   - Frontend calls `http://localhost:8000/chat` directly (no backend proxy)
   - **Loading state**: Displays spinner with "Thinking..." text
   - JSON payload:
   ```json
   {
     "selected_model": "model_name",
     "user_input": "user question",
     "chat_history": [
       {"role": "user", "content": "previous question"},
       {"role": "assistant", "content": "previous answer"}
     ],
     "global_kb_path": "global_kb_vectorstore",
     "company_kb_path": "company_kb_vectorstore",
     "chat_kb_path": "chat_attachment_vectorstore"  // if has_attachments
   }
   ```
5. External API uses loaded vectorstores and returns AI response with `loaded_paths`
6. Frontend displays response in chat window
7. **Auto-cleanup**: Uploaded files are automatically cleared after successful response

### Vectorstore Management
**All operations call external API directly from frontend:**

1. **Build Vectorstore**
   - API: `POST http://localhost:8000/build-knowledge-base`
   - Parameters: `batch_size=15`, `delay_between_batches=0.2`, `max_retries=3`
   - Creates vectorstore:
     - **Settings (global)**: Creates `global_kb_vectorstore/` (saved to disk)
     - **Settings (company)**: Creates `company_kb_vectorstore/` (saved to disk)
     - **Chat**: Creates `chat_attachment_vectorstore/` (IN-MEMORY ONLY, not saved)

2. **Save Vectorstore** (Settings only)
   - API: `POST http://localhost:8000/save-vectorstore`
   - Saves to disk: `global_kb_vectorstore/` or `company_kb_vectorstore/`
   - **NOT called for chat attachments** - they remain in memory only

3. **Load Vectorstore** (Settings - Auto-load on model selection)
   - API: `POST http://localhost:8000/load-vectorstore`
   - Loads from saved folders into memory
   - Returns vector count for status badge

### Vectorstore Persistence
- ✅ **Global KB**: Saved to disk, persists across sessions
- ✅ **Company KB**: Saved to disk, persists across sessions  
- 🔄 **Chat Attachments**: In-memory only, cleared when external API restarts

## Recent Changes (November 22, 2025)

### Docker & Build Automation
- ✅ **Docker Support**: Added complete Docker setup with multi-stage Dockerfile optimized for production
- ✅ **Docker Compose**: Created docker-compose.yml with health checks, resource limits, and proper networking
- ✅ **Build Automation**: Created `make.sh` script with commands for development, Docker, and deployment
- ✅ **Build Optimization**: Added `.dockerignore` to exclude unnecessary files from Docker context
- ✅ **Documentation**: Created `DOCKER.md` with complete setup guide and troubleshooting

### Code Optimization & Bug Fixes
- ✅ **Shared Types**: Created `client/src/types/index.ts` to centralize Message interface (eliminates duplication)
- ✅ **API Configuration**: Made external API URL configurable via `VITE_API_URL` environment variable
- ✅ **Fixed File Handler Bug**: Resolved stale closure issue in onRemoveFile using state updater pattern
- ✅ **Improved Error Handling**: Added response.ok checks in vectorstore loading with detailed logging
- ✅ **Code Consolidation**: Simplified chatInputProps object to reduce duplication without ineffective memoization
- ✅ **Maintained React Query Benefits**: Kept fetch logic inside mutations for proper caching/retry semantics
- ✅ **Fixed Fast Refresh Warning**: Split `useChatContext` hook into separate file (`client/src/hooks/useChatContext.ts`) to enable Vite Fast Refresh for ChatContext.tsx

### Chat State Persistence
- ✅ **React Context Implementation**: Created ChatProvider to maintain state across navigation
- ✅ **Message Persistence**: Chat messages persist when switching to Settings and back
- ✅ **File Persistence**: Uploaded files remain in state during navigation
- ✅ **Centered UI**: Message box background restricted to component only (not full container)
- ✅ **Auto-expanding Input**: Textarea grows dynamically with content (lovable.dev style)
- ✅ **Conditional File Upload Bar**: Only shows when files are present in centered mode

## Previous Changes (November 9, 2025)

### Complete Direct External API Integration
- ✅ **File uploads**: Frontend → `POST http://localhost:8000/build-knowledge-base`
- ✅ **Chat messages**: Frontend → `POST http://localhost:8000/chat`
- ✅ **Save vectorstore**: Frontend → `POST http://localhost:8000/save-vectorstore`
- ✅ **Load vectorstore**: Frontend → `POST http://localhost:8000/load-vectorstore`
- ✅ **Check vectorstore**: Frontend → `POST http://localhost:8000/load-vectorstore` (auto-loads)
- ✅ **Backend simplified**: Only `/api/models` remains (format transformer)
- ✅ **Consistent pattern**: All features use direct external API calls
- ✅ Visual indicators: Processing/Ready badges with detailed stats

### Previous Features
- ✅ Removed delete vectorstore functionality
- ✅ Implemented vectorstore auto-save to disk
- ✅ Created check endpoint with load-vectorstore API integration
- ✅ Added auto-loading functionality on Settings page
- ✅ Implemented green "Vectorstore Ready" status badges

## Environment Requirements

### External API
The application requires the external API for full functionality:
- Default URL: `http://localhost:8000`
- Configurable via `VITE_API_URL` environment variable
- Functions:
  - Model management
  - Knowledge base building
  - Vectorstore persistence
  - Chat responses

### Installed Packages
Key dependencies:
- `multer` + `@types/multer` - File upload handling
- `@tanstack/react-query` - Data fetching & caching
- `wouter` - Client-side routing
- `express` - Backend server
- `drizzle-orm` - Database ORM (schema defined, using in-memory storage)

## Deployment

### Docker Deployment

The application includes Docker support for easy deployment:

**Quick Start:**
```bash
# Local development (simplest)
./make.sh            # Does everything automatically

# Or Docker deployment
./make.sh docker-build
./make.sh docker-up

# Or using Docker Compose directly
docker-compose build
docker-compose up -d
```

**Configuration:**
- Port: 5000 (configurable in docker-compose.yml)
- Environment: Production by default
- External API URL: Set via `VITE_API_URL` environment variable
- Volume mounts: Enabled for development hot-reload

**Files:**
- `Dockerfile` - Multi-stage build optimized for production
- `docker-compose.yml` - Container orchestration
- `.dockerignore` - Build context optimization
- `make.sh` - Build and deployment automation script
- `DOCKER.md` - Detailed Docker setup guide

See `DOCKER.md` for complete Docker documentation.

### Local Development

```bash
# Using make.sh (simplest - does everything)
./make.sh            # Checks deps, installs if needed, starts dev server

# Or step by step
./make.sh install    # Install dependencies
./make.sh dev        # Start development server

# Or using npm directly
npm install
npm run dev
```

## User Workflow

1. **Setup**
   - Start external API at `http://localhost:8000`
   - Navigate to Settings page
   - Select AI model from dropdown
   - Upload files to General Context and/or Company Policy
   - Vectorstores auto-save and auto-load

2. **Chat**
   - Navigate to Chat page
   - Optionally upload files for chat context
   - Send messages
   - First message with files triggers vectorstore build
   - Subsequent messages use built vectorstore
   - AI responds with context from all loaded vectorstores

## Technical Notes

- All file uploads use FormData for frontend-to-backend communication
- All external API calls use URLSearchParams (form-urlencoded)
- Vectorstores persist to disk and auto-load on page refresh
- Model selection required before chat/vectorstore operations
- Toast notifications provide user feedback for all operations
- Multi-stage Docker build for optimized production images
- Build automation via make.sh script
